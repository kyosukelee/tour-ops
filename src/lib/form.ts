// FormData をオブジェクトにする(Server Action とテストで共通)
// 同じ名前が複数あるとき(チェックボックスの複数選択など)は配列にする
export function formToObject(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const obj: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const prev = obj[k];
    obj[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return obj;
}
