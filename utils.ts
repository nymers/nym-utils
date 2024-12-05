import * as Ansi from "@effect/printer-ansi/Ansi";
import * as Doc from "@effect/printer-ansi/AnsiDoc";

export function flattenObject(obj: Record<string, any>, prefix = "") {
  let result: [string, any][] = [];
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      if (Array.isArray(obj[key])) {
        // include count
        result.push([`${newKey}[count]`, obj[key].length]);
      }
      result = result.concat(flattenObject(obj[key], newKey));
    } else {
      result.push([newKey, obj[key]]);
    }
  }
  return result;
}

export function printObjectFlattened(obj: Record<string, any>, prefix = "") {
  const flattened = flattenObject(obj, prefix);
  return printFlattened(flattened);
}

export function printFlattened(flattened: [string, any][]) {
  const data: Doc.Doc<any>[] = flattened
    .map(([key, val]) => {
      return [
        Doc.text(key).pipe(Doc.annotate(Ansi.bold), Doc.annotate(Ansi.blue)),
        Doc.text(": "),
        Doc.text(JSON.stringify(val) ?? "").pipe(Doc.annotate(Ansi.green)),
        Doc.line,
      ];
    })
    .flat();
  const doc = Doc.hsep(data);
  return Doc.render(doc, {
    style: "smart",
  });
}
