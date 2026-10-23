// Célula de CSV (separador ";", o que o Excel em português abre certo).
// Texto que começa com = + - @ (ou tab/retorno) o Excel executa como fórmula, e o formulário público deixa qualquer
// pessoa digitar isso num nome: com o apóstrofo na frente vira texto comum.
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
