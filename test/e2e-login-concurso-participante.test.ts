import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { auth } from "../src/modules/auth";
import { concursos } from "../src/modules/concursos";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { UserModel } from "../src/modules/auth/mongoose";

const ADMIN_CODIGO = process.env.TEST_ADMIN_CODIGO ?? process.env.SISPA_CODIGO ?? "219640329";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.SISPA_PASSWORD;
const TEST_ESTUDIANTE_CODIGO = process.env.TEST_ESTUDIANTE_CODIGO ?? "218807823";

const itWithCreds = ADMIN_PASSWORD ? it : it.skip;

let memoryServer: MongoMemoryServer;
const app = new Elysia().use(auth).use(concursos);

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
});

beforeEach(async () => {
  await ConcursoModel.deleteMany({});
  await UserModel.deleteMany({ codigo: ADMIN_CODIGO });
  await UserModel.create({
    codigo: ADMIN_CODIGO,
    nombre: "Admin Test",
    isAdmin: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("e2e auth + concursos + participantes", () => {
  itWithCreds("login -> crear concurso -> asignar participante", async () => {
    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: ADMIN_CODIGO,
          password: ADMIN_PASSWORD,
        }),
      })
    );

    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as { token: string };
    const sessionCookie = loginRes.headers.get("set-cookie")?.split(";")[0];
    expect(typeof loginBody.token).toBe("string");
    expect(loginBody.token.length).toBeGreaterThan(10);

    const createRes = await app.handle(
      new Request("http://localhost/concursos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${loginBody.token}`,
          ...(sessionCookie && { cookie: sessionCookie }),
        },
        body: JSON.stringify({
          nombre: "Concurso E2E",
          cupo: 20,
          sharedFields: ["carrera_o_semestre", "correo", "institucion", "nombre_completo", "telefono"],
          constraints: [{ id: "modalidad_individual", fields: ["descripcion", "descripcion_proyecto"] }],
          niveles: ["N/A", "Licenciatura", "Posgrado"],
          allowMultiple: false,
        }),
      })
    );

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { _id: string };
    expect(typeof created._id).toBe("string");
    expect(created._id.length).toBeGreaterThan(10);

    const registerRes = await app.handle(
      new Request(`http://localhost/concursos/${created._id}/participantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: TEST_ESTUDIANTE_CODIGO,
          tipo: "modalidad_individual",
          nivel: "N/A",
          semestre: 5,
          campos: {
            carrera_o_semestre: "LICENCIATURA EN TECNOLOGIAS DE LA INFORMACION",
            correo: "josefernando10a.c@gmail.com",
            descripcion: "Proyecto E2E de prueba",
            descripcion_proyecto: "Analisis de patrones con machine learning",
            institucion: "CUVALLES",
            nombre_completo: "JOSE FERNANDO ARENAS CAMACHO",
            telefono: "3312345678",
          },
        }),
      })
    );

    expect(registerRes.status).toBe(201);
    const participante = (await registerRes.json()) as {
      codigo: string;
      tipo: string;
      campos: Record<string, string>;
    };

    expect(participante.codigo).toBe(TEST_ESTUDIANTE_CODIGO);
    expect(participante.tipo).toBe("modalidad_individual");
    expect(participante.campos.descripcion_proyecto).toBe("Analisis de patrones con machine learning");

    const saved = await ConcursoModel.findById(created._id).lean();
    expect(saved?.participantes?.length).toBe(1);
  });
});
