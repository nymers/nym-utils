import { type Pipeable, Schema } from "effect";
import { dual } from "effect/Function";
import { pipeArguments } from "effect/Pipeable";

export type PrometheusLabelValue = string | number | string[] | number[];
export type PrometheusLabels = Record<string, PrometheusLabelValue>;

// biome-ignore lint: suspicious/noUnsafeDeclarationMerging
export class PrometheusMetric extends Schema.Class<PrometheusMetric>(
  "PrometheusMetric"
)({
  key: Schema.String,
  type: Schema.Union(Schema.Literal("counter"), Schema.Literal("gauge")),
  help: Schema.optional(Schema.String),
}) {
  static gauge(key: string) {
    return PrometheusMetric.make({ key, type: "gauge" });
  }

  static counter(key: string) {
    return PrometheusMetric.make({ key, type: "counter" });
  }

  static withHelp: {
    (help: string): (self: PrometheusMetric) => PrometheusMetric;
    (self: PrometheusMetric, help: string): PrometheusMetric;
  } = dual(2, (self, help) => {
    return PrometheusMetric.make({ ...self, help });
  });

  static exportWith: {
    (value: number | string, labels: PrometheusLabels): (
      self: PrometheusMetric
    ) => PrometheusExport;
    (
      self: PrometheusMetric,
      value: number | string,
      labels: Record<string, string>
    ): PrometheusExport;
  } = dual(3, (self, value, labels) => {
    return PrometheusExport.make({ metric: self, labels, value });
  });
}
PrometheusMetric.prototype.pipe = function () {
  // biome-ignore lint/style/noArguments: <explanation>
  return pipeArguments(this, arguments);
};

export interface PrometheusMetric extends Pipeable.Pipeable {}

export class PrometheusExport extends Schema.Class<PrometheusExport>(
  "PrometheusExport"
)({
  metric: PrometheusMetric,
  value: Schema.Union(Schema.Number, Schema.String),
  labels: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(
        Schema.String,
        Schema.Number,
        Schema.Array(Schema.String),
        Schema.Array(Schema.Number)
      ),
    })
  ),
}) {
  static print(self: PrometheusExport) {
    const { metric, labels, value } = self;
    const base = `# HELP ${metric.key} ${metric.help ?? ""}\n# TYPE ${
      metric.key
    } ${metric.type}\n`;
    const labelStr =
      labels && Object.keys(labels).length
        ? `{${Object.entries(labels)
            .flatMap(([k, v]) => {
              if (Array.isArray(v)) {
                // Remove duplicates by converting to Set and back to array
                const uniqueValues = [...new Set(v)];
                return uniqueValues.map((item) => `${k}="${item}"`);
              }
              return [`${k}="${v}"`];
            })
            .join(",")}}`
        : "";
    return `${base}${metric.key}${labelStr} ${value}`;
  }
}
