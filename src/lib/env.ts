/**
 * Lectura robusta de variables de entorno.
 *
 * El Bloc de notas de Windows guarda los archivos en UTF-8 **con BOM**.
 * Ese carácter invisible (\uFEFF) queda pegado al nombre de la primera
 * variable, de modo que `process.env.DATABASE_URL` resulta indefinida
 * aunque el archivo se vea correcto. Aquí se contempla ese caso.
 */
export function readEnv(name: string): string | undefined {
  const direct = process.env[name];
  if (direct != null && direct !== "") return direct;

  // Variante con BOM al inicio del nombre
  const withBom = process.env[`\uFEFF${name}`];
  if (withBom != null && withBom !== "") return withBom;

  // Búsqueda tolerante: ignora BOM, espacios y mayúsculas
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.replace(/^\uFEFF/, "").trim().toLowerCase() === target) {
      if (value != null && value !== "") return value;
    }
  }
  return undefined;
}
