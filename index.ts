import { Command, Options } from "@effect/cli";
import { HttpApiBuilder, HttpMiddleware } from "@effect/platform";
import { BunHttpServer } from "@effect/platform-bun";
import {
  NodeContext,
  NodeHttpClient,
  NodeRuntime,
} from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { layer } from "nym-utils/api";
import { Address, Node } from "nym-utils/domain";
import { printObjectFlattened } from "./utils";

const nodes = Options.text("node").pipe(
  Options.repeated,
  Options.map((ids) => {
    return ids
      .map((id) => Number.parseInt(id))
      .filter((id) => !Number.isNaN(id));
  })
);
const port = Options.integer("port").pipe(Options.withDefault(9100));
const addresses = Options.text("address").pipe(Options.repeated);

const exporter = Command.make("exporter", {
  port,
}).pipe(
  Command.withDescription("Nodes and addresses details prometheus exporter"),
  Command.withHandler(({ port }) => {
    return Console.log(`Starting exporter on port ${port}`).pipe(
      Effect.zipRight(
        HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
          Layer.provide(layer),
          Layer.provide(HttpApiBuilder.middlewareCors()),
          Layer.provide(NodeHttpClient.layer),
          Layer.provide(BunHttpServer.layer({ port: port })),
          Layer.launch
        )
      )
    );
  })
);

const nodeInfo = Command.make("node", { nodes }).pipe(
  Command.withDescription("Node info"),
  Command.withHandler(({ nodes }) => {
    return Effect.reduce(nodes, "", (acc, nodeId) =>
      Effect.gen(function* () {
        const node = yield* Node.fromExplorer(nodeId);
        const out = printObjectFlattened(node, nodeId.toString());
        return `${acc + out}`;
      })
    ).pipe(Effect.flatMap(Console.log), Effect.provide(NodeHttpClient.layer));
  })
);

const addrInfo = Command.make("addr", { addresses }).pipe(
  Command.withDescription("Address info"),
  Command.withHandler(({ addresses }) => {
    return Effect.reduce(addresses, "", (acc, addressId) =>
      Effect.gen(function* () {
        const address = yield* Address.fromExplorer(addressId);
        const out = printObjectFlattened(address, address.address);
        return `${acc + out}`;
      })
    ).pipe(Effect.flatMap(Console.log), Effect.provide(NodeHttpClient.layer));
  })
);

const command = Command.make("nym-util").pipe(
  Command.withSubcommands([exporter, addrInfo, nodeInfo])
);

export const cli = Command.run(command, {
  name: "NYM util",
  version: "0.0.1",
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
