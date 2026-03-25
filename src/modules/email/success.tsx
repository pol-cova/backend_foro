import { Tailwind, Section, Text, Hr } from "@react-email/components";

export interface SuccessEmailProps {
  nombre: string;
  concurso: string;
  tipo: string;
  nivel: string;
  campos: Record<string, string>;
  totalParticipantes: number;
}

const TIPO_PREFIXES = /^(modalidad_|tipo_|formato_)/i;

function labelFromKey(key: string): string {
  return key
    .replace(/_\d+$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, " ")
    .trim();
}

function toHumanReadable(value: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(TIPO_PREFIXES, "");
  return withoutPrefix
    .split(/_|\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ marginBottom: 12 }}>
      <Text style={{ margin: 0, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Text>
      <Text style={{ margin: "4px 0 0 0", fontSize: 15, color: "#1e293b" }}>
        {value}
      </Text>
    </Section>
  );
}

export default function SuccessEmail({ nombre, concurso, tipo, nivel, campos, totalParticipantes }: SuccessEmailProps) {
  const plural = totalParticipantes !== 1;
  const summaryRows: { label: string; value: string }[] = [];

  if (tipo?.trim()) summaryRows.push({ label: "Participacion", value: toHumanReadable(tipo) });
  if (nivel?.trim()) summaryRows.push({ label: "Nivel", value: toHumanReadable(nivel) });
  for (const [key, value] of Object.entries(campos ?? {})) {
    if (value != null && String(value).trim()) {
      summaryRows.push({ label: labelFromKey(key), value: String(value).trim() });
    }
  }

  return (
    <Tailwind>
      <Section
        style={{
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          maxWidth: 560,
          margin: "0 auto",
          padding: 32,
          backgroundColor: "#ffffff",
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
          Hola {nombre},
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 1.6, color: "#475569", marginBottom: 24 }}>
          Te inscribiste exitosamente a{" "}
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{concurso}</span>.
        </Text>

        {summaryRows.length > 0 && (
          <Section
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Resumen de tu inscripcion
            </Text>
            {summaryRows.map((row, i) => (
              <FieldRow key={`${row.label}-${i}`} label={row.label} value={row.value} />
            ))}
          </Section>
        )}

        <Hr style={{ borderColor: "#e2e8f0", marginBottom: 20 }} />
        <Text style={{ fontSize: 14, color: "#64748b" }}>
          Actualmente hay {totalParticipantes} participante{plural ? "s" : ""} inscrito{plural ? "s" : ""} en este evento.
        </Text>
      </Section>
    </Tailwind>
  );
}

SuccessEmail.PreviewProps = {
  nombre: "Paul Contreras",
  concurso: "Concurso de Programación",
  tipo: "modalidad_individual",
  nivel: "Intermedio",
  campos: {
    institucion: "CUVALLES",
    descripcion_proyecto: "Sistema de punto de venta",
    nombre_1: "Paul Contreras",
    codigo_1: "219640329",
    correo_1: "paul@cuvalles.edu.mx",
    tel_1: "3311234567",
    carrera_1: "Ingeniería en Computación",
    semestre_1: "7",
  },
  totalParticipantes: 5,
} satisfies SuccessEmailProps;
