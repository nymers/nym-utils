import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { Address, Node } from "nym-utils/domain";

class NodesMetrics extends HttpApiGroup.make("nodes-metrics").add(
  HttpApiEndpoint.get("node-metrics", "/metrics/")
    .setUrlParams(
      Schema.Struct({
        id: Schema.optional(
          Schema.Union(
            Schema.NumberFromString,
            Schema.Array(Schema.NumberFromString)
          )
        ),
        address: Schema.optional(
          Schema.Union(Schema.String, Schema.Array(Schema.String))
        ),
      })
    )
    .addSuccess(
      Schema.String.pipe(
        HttpApiSchema.withEncoding({
          kind: "Text",
          contentType: "text/plain",
        })
      )
    )
) {}

export const NodesAPI = HttpApi.empty.add(NodesMetrics);

export const APIGroupLive = HttpApiBuilder.group(
  NodesAPI,
  "nodes-metrics",
  (handlers) =>
    handlers
      .handle("node-metrics", (_) =>
        Effect.gen(function* () {
          const ids = _.urlParams.id
            ? _.urlParams.id instanceof Array
              ? _.urlParams.id
              : [_.urlParams.id]
            : [];
          const addresses = _.urlParams.address
            ? _.urlParams.address instanceof Array
              ? _.urlParams.address
              : [_.urlParams.address]
            : [];
          yield* Effect.logInfo(
            `Exporting metrics for
              nodes: ${ids.toString()}
              addresses: ${addresses.toString()}`
          );
          const promises = ids
            .map((id) =>
              Node.prometheusExport(id).pipe(
                Effect.tapErrorCause(Effect.logError),
                Effect.orElseSucceed(() => "")
              )
            )
            .concat(
              addresses.map((address) =>
                Address.prometheusExport(address).pipe(
                  Effect.tapErrorCause(Effect.logError),
                  Effect.orElseSucceed(() => "")
                )
              )
            );
          return yield* Effect.all(promises, { concurrency: 8 }).pipe(
            Effect.map((promises) => promises.join("\n"))
          );
        })
      )
);

export const layer = HttpApiBuilder.api(NodesAPI).pipe(
  Layer.provide(APIGroupLive)
);
