import { Section, Text, Hr } from "@react-email/components";

export interface CambioNivelEmailProps {
  nombre: string;
  concurso: string;
  nivelNuevo: string;
  razon: string;
}

export default function CambioNivelEmail({ nombre, concurso, nivelNuevo, razon }: CambioNivelEmailProps) {
  return (
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
        El nivel de tu participación en{" "}
        <span style={{ color: "#0f172a", fontWeight: 600 }}>{concurso}</span>{" "}
        ha sido actualizado a{" "}
        <span style={{ color: "#0f172a", fontWeight: 600 }}>{nivelNuevo}</span>.
      </Text>
      <Hr style={{ borderColor: "#e2e8f0", marginBottom: 20 }} />
      <Text
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#64748b",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Motivo
      </Text>
      <Text style={{ fontSize: 15, color: "#1e293b", margin: 0 }}>{razon}</Text>
    </Section>
  );
}

CambioNivelEmail.PreviewProps = {
  nombre: "Paul Contreras",
  concurso: "Concurso de Programación",
  nivelNuevo: "AVANZADO",
  razon: "El participante demostró habilidades superiores al nivel básico.",
} satisfies CambioNivelEmailProps;
