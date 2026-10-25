import data from "./data.json";

export type CrDistrict = { code: string; name: string };
export type CrCanton = { code: string; name: string; districts: CrDistrict[] };
export type CrProvince = { code: string; name: string; cantons: CrCanton[] };

type Raw = Array<{ c: string; n: string; k: Array<{ c: string; n: string; d: Array<[string, string]> }> }>;

// Official IGN codes: province "1", canton "101", district "10101" (also the postal code).
export const crProvinces: CrProvince[] = (data as Raw).map((province) => ({
  code: province.c,
  name: province.n,
  cantons: province.k.map((canton) => ({
    code: canton.c,
    name: canton.n,
    districts: canton.d.map(([code, name]) => ({ code, name })),
  })),
}));

export const findProvince = (code?: string) => crProvinces.find((province) => province.code === code);

export const findCanton = (provinceCode?: string, cantonCode?: string) =>
  findProvince(provinceCode)?.cantons.find((canton) => canton.code === cantonCode);

export const findDistrict = (provinceCode?: string, cantonCode?: string, districtCode?: string) =>
  findCanton(provinceCode, cantonCode)?.districts.find((district) => district.code === districtCode);
