export const productColors = [
  { value: "Black", labelEs: "Negro", labelEn: "Black", hex: "#111111" },
  { value: "White", labelEs: "Blanco", labelEn: "White", hex: "#F5F5F2" },
  { value: "Gray", labelEs: "Gris", labelEn: "Gray", hex: "#8A8A87" },
  { value: "Charcoal", labelEs: "Carbon", labelEn: "Charcoal", hex: "#3F4142" },
  { value: "Navy", labelEs: "Azul marino", labelEn: "Navy", hex: "#1E2F4F" },
  { value: "Blue", labelEs: "Azul", labelEn: "Blue", hex: "#3267A8" },
  { value: "Sky Blue", labelEs: "Celeste", labelEn: "Sky Blue", hex: "#8CC8E8" },
  { value: "Teal", labelEs: "Verde azulado", labelEn: "Teal", hex: "#287D78" },
  { value: "Green", labelEs: "Verde", labelEn: "Green", hex: "#39734C" },
  { value: "Olive", labelEs: "Oliva", labelEn: "Olive", hex: "#74734A" },
  { value: "Red", labelEs: "Rojo", labelEn: "Red", hex: "#B83A3A" },
  { value: "Burgundy", labelEs: "Vino", labelEn: "Burgundy", hex: "#702D3D" },
  { value: "Pink", labelEs: "Rosa", labelEn: "Pink", hex: "#D987A2" },
  { value: "Purple", labelEs: "Morado", labelEn: "Purple", hex: "#765589" },
  { value: "Brown", labelEs: "Cafe", labelEn: "Brown", hex: "#765640" },
  { value: "Beige", labelEs: "Beige", labelEn: "Beige", hex: "#D5C5A5" },
  { value: "Yellow", labelEs: "Amarillo", labelEn: "Yellow", hex: "#E3C548" },
  { value: "Orange", labelEs: "Naranja", labelEn: "Orange", hex: "#D97832" },
] as const;

export function getProductColor(value: string | null | undefined) {
  return productColors.find((color) => color.value === value);
}