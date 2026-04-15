import SuccessEmail, { type SuccessEmailProps } from "./success";

export default SuccessEmail;

const equipoPreview: SuccessEmailProps = {
  nombre: "Gerson Del Toro",
  concurso: "Concurso de Programación",
  tipo: "modalidad_equipo",
  nivel: "Intermedio",
  totalParticipantes: 8,
  campos: {
    institucion: "CUVALLES",
    descripcion_proyecto: "Punto de venta",
    nombre_equipo: "DevSpartans",
    nombre_1: "Gerson Del Toro",
    codigo_1: "219813363",
    correo_1: "gerson@cuvalles.edu.mx",
    tel_1: "3311978094",
    carrera_1: "Ingeniería en Electrónica y Computación",
    semestre_1: "7",
    nombre_2: "Paul Contreras",
    codigo_2: "219640329",
    correo_2: "paul@cuvalles.edu.mx",
    tel_2: "3311234567",
    carrera_2: "Ingeniería en Computación",
    semestre_2: "6",
  },
};

SuccessEmail.PreviewProps = equipoPreview as (typeof SuccessEmail)["PreviewProps"];
