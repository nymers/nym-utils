import { HttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  PrometheusExport,
  PrometheusMetric,
  type PrometheusLabels,
} from "nym-utils/prometheus";

const NodeType = Schema.Union(Schema.Literal("nym_node"));

function formatTimestamp(date: Date) {
  // Get the date parts
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  // Get milliseconds and pad to 9 digits for nanoseconds
  const nanos = String(date.getUTCMilliseconds())
    .padStart(3, "0")
    .padEnd(9, "0");

  // Get timezone offset
  const tzOffset = date.getTimezoneOffset();
  const tzHours = String(Math.abs(Math.floor(tzOffset / 60))).padStart(2, "0");
  const tzMinutes = String(Math.abs(tzOffset % 60)).padStart(2, "0");
  const tzSign = tzOffset <= 0 ? "+" : "-";

  // Construct the timestamp string
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${nanos} ${tzSign}${tzHours}:${tzMinutes}:00`;
}

const APIDate = Schema.transform(
  Schema.String.annotations({ description: "Date as string" }),
  Schema.DateFromSelf,
  {
    strict: true,
    decode: (s) => new Date(s.replace(/(\+\d{2}:\d{2}):\d{2}$/, "$1")),
    encode: (d) => formatTimestamp(d),
  }
);

const IpV4Addr = Schema.String.pipe(
  Schema.filter((s) => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(s) || "Invalid ipv4 address";
  })
);

const IpV6Addr = Schema.String.pipe(
  Schema.filter((s) => {
    const ipv6Regex = /^(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}$/;
    return ipv6Regex.test(s) || "Invalid ipv6 address";
  })
);

const Hostname = Schema.String.pipe(
  Schema.filter((s) => {
    const hostnameRegex = /^[a-zA-Z0-9.-]+$/;
    return hostnameRegex.test(s) || "Invalid hostname";
  })
);

const HostIdentifier = Schema.Union(IpV4Addr, IpV6Addr, Hostname);

const HostInfo = Schema.Struct({
  ip_address: Schema.Array(HostIdentifier),
  hostname: Schema.NullOr(Hostname),
  keys: Schema.Struct({
    ed25519: Schema.String,
    x25519: Schema.String,
    x25519_noise: Schema.NullOr(Schema.String),
  }),
});

const BuildInformation = Schema.Struct({
  binary_name: Schema.String,
  build_timestamp: APIDate,
  build_version: Schema.String,
  commit_sha: Schema.String,
  commit_timestamp: APIDate,
  commit_branch: Schema.String,
  rustc_version: Schema.String,
  rustc_channel: Schema.String,
  cargo_profile: Schema.String,
  cargo_triple: Schema.String,
});

const AddressEntity = Schema.Struct({
  address: Schema.String,
});

const NetworkRequester = AddressEntity.pipe(
  Schema.extend(
    Schema.Struct({
      uses_exit_policy: Schema.Boolean,
    })
  )
);

const NodeDescription = Schema.Struct({
  last_polled: APIDate,
  host_information: HostInfo,
  declared_role: Schema.Struct({
    mixnode: Schema.Boolean,
    entry: Schema.Boolean,
    exit_nr: Schema.Boolean,
    exit_ipr: Schema.Boolean,
  }),
  auxiliary_details: Schema.Struct({
    location: Schema.NullOr(Schema.String),
    announce_ports: Schema.Struct({
      verloc_port: Schema.NullOr(Schema.Number),
      mix_port: Schema.NullOr(Schema.Number),
    }),
    accepted_operator_terms_and_conditions: Schema.Boolean,
  }),
  build_information: BuildInformation,
  network_requester: NetworkRequester,
  ip_packet_router: AddressEntity,
  authenticator: AddressEntity,
  wireguard: Schema.NullOr(
    Schema.Struct({
      port: Schema.Number,
      public_key: Schema.String,
    })
  ),
  mixnet_websockets: Schema.Struct({
    ws_port: Schema.Number,
    wss_port: Schema.NullOr(Schema.Number),
  }),
});

const BondInformation = Schema.Struct({
  node_id: Schema.Number,
  owner: Schema.String,
  original_pledge: Schema.Struct({
    denom: Schema.String,
    amount: Schema.String,
  }),
  bonding_height: Schema.Number,
  is_unbonding: Schema.Boolean,
  node: Schema.Struct({
    host: HostIdentifier,
    custom_http_port: Schema.NullOr(Schema.Number),
    identity_key: Schema.String,
  }),
});

const RewardingDetails = Schema.Struct({
  cost_params: Schema.Struct({
    profit_margin_percent: Schema.String,
    interval_operating_cost: Schema.Struct({
      denom: Schema.String,
      amount: Schema.String,
    }),
  }),
  operator: Schema.String,
  delegates: Schema.String,
  total_unit_reward: Schema.String,
  unit_delegation: Schema.String,
  last_rewarded_epoch: Schema.Number,
  unique_delegations: Schema.Number,
});

const Location = Schema.Struct({
  two_letter_iso_country_code: Schema.String.pipe(Schema.length(2)),
  three_letter_iso_country_code: Schema.String.pipe(Schema.length(3)),
  country_name: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
});

const Delegation = Schema.Struct({
  owner: Schema.String,
  node_id: Schema.Number,
  cumulative_reward_ratio: Schema.String,
  amount: Schema.Struct({
    denom: Schema.String,
    amount: Schema.String,
  }),
  height: Schema.Number,
  proxy: Schema.NullOr(Schema.String),
});

export class Node extends Schema.Class<Node>("NymNode")({
  node_id: Schema.Number,
  contract_node_type: NodeType,
  description: NodeDescription,
  bond_information: BondInformation,
  rewarding_details: RewardingDetails,
  location: Location,
  delegations: Schema.Array(Delegation),
}) {
  static fromExplorer(nodeId: number) {
    const decode = Schema.decodeUnknown(Node);
    return Effect.gen(function* (_) {
      const cli = yield* HttpClient.HttpClient;
      const resp = yield* cli.get(
        `https://explorer.nymtech.net/api/v1/tmp/unstable/nym-nodes/${nodeId}`
      );
      const data = yield* resp.json;
      return yield* decode(data);
    }).pipe(Effect.scoped);
  }

  static prometheusExport(nodeId: number) {
    return Node.fromExplorer(nodeId).pipe(
      Effect.map((node) => {
        return Node.makeNodeExport(node, {
          node_id: nodeId,
          node_name: node.description.host_information.hostname ?? nodeId,
          node_role: Node.role(node),
        });
      })
    );
  }

  static role(node: Node) {
    const { mixnode, entry, exit_nr, exit_ipr } =
      node.description.declared_role;
    if (mixnode) {
      return "mixnode";
    }
    if (entry) {
      return "entry";
    }
    if (exit_nr) {
      return "exit_nr";
    }
    if (exit_ipr) {
      return "exit_ipr";
    }
    return "unknown";
  }

  static delegationsSum(node: Node) {
    return {
      count: node.delegations.length,
      sum: node.delegations.reduce((acc, d) => {
        return acc + Number(d.amount.amount);
      }, 0),
    };
  }
  static NodeMetrics = {
    operator_rewards: PrometheusMetric.gauge("nym_node_operator_rewards").pipe(
      PrometheusMetric.withHelp("Total rewards for the operator")
    ),
    profit_margin_percent: PrometheusMetric.gauge(
      "nym_node_profit_margin_percent"
    ).pipe(PrometheusMetric.withHelp("Profit margin percent")),
    delegators_count: PrometheusMetric.gauge("nym_node_delegators_count").pipe(
      PrometheusMetric.withHelp("Number of delegators")
    ),
    delegation_sum: PrometheusMetric.gauge("nym_node_delegation_sum").pipe(
      PrometheusMetric.withHelp("Sum of delegations")
    ),
    operating_cost: PrometheusMetric.gauge("nym_node_operating_cost").pipe(
      PrometheusMetric.withHelp("Operating cost")
    ),
    last_rewarded_epoch: PrometheusMetric.counter(
      "nym_node_last_rewarded_epoch"
    ).pipe(PrometheusMetric.withHelp("Last rewarded epoch")),
    unique_delegations: PrometheusMetric.gauge(
      "nym_node_unique_delegations"
    ).pipe(PrometheusMetric.withHelp("Number of unique delegations")),
    total_unit_reward: PrometheusMetric.gauge(
      "nym_node_total_unit_reward"
    ).pipe(PrometheusMetric.withHelp("Total unit reward")),
  } as const;

  static makeNodeExport = (
    node: Node,
    labels: Record<string, string | number>
  ) => {
    const { rewarding_details, delegations } = node;
    const sums = Node.delegationsSum(node);
    const values: Record<keyof typeof Node.NodeMetrics, string | number> = {
      total_unit_reward: rewarding_details.total_unit_reward,
      unique_delegations: rewarding_details.unique_delegations,
      last_rewarded_epoch: rewarding_details.last_rewarded_epoch,
      delegators_count: sums.count,
      delegation_sum: sums.sum,
      profit_margin_percent:
        rewarding_details.cost_params.profit_margin_percent,
      operating_cost:
        rewarding_details.cost_params.interval_operating_cost.amount,
      operator_rewards: rewarding_details.delegates,
    };
    return Object.entries(Node.NodeMetrics).reduce((acc, [key, metric]) => {
      const fixedKey = key as unknown as keyof typeof Node.NodeMetrics;
      const exp = metric.pipe(
        PrometheusMetric.exportWith(values[fixedKey], labels)
      );
      return `${acc + PrometheusExport.print(exp)}\n\n`;
    }, "");
  };
}

// address example
/*

{
    "address": "n1yv7smmmzsrqx88gze33sq6a02tn5u6ge808quz",
    "balances": [
        {
            "denom": "unym",
            "amount": "481464538"
        }
    ],
    "total_value": {
        "denom": "unym",
        "amount": "7610802558"
    },
    "delegations": [
        {
            "node_id": 1613,
            "delegated": {
                "denom": "unym",
                "amount": "4067485311"
            },
            "height": 13747124,
            "proxy": null
        }
    ],
    "accumulated_rewards": [
        {
            "node_id": 1613,
            "rewards": {
                "denom": "unym",
                "amount": "90138338"
            },
            "amount_staked": {
                "denom": "unym",
                "amount": "4067485311"
            },
            "node_still_fully_bonded": true
        }
    ],
    "total_delegations": {
        "denom": "unym",
        "amount": "4067485311"
    },
    "claimable_rewards": {
        "denom": "unym",
        "amount": "90138338"
    },
    "vesting_account": null,
    "operator_rewards": {
        "denom": "unym",
        "amount": "2971714371"
    }
}
*/
export class Address extends Schema.Class<Address>("Address")({
  address: Schema.String,
  balances: Schema.Array(
    Schema.Struct({
      denom: Schema.String,
      amount: Schema.String,
    })
  ),
  total_value: Schema.Struct({
    denom: Schema.String,
    amount: Schema.String,
  }),
  delegations: Schema.Array(
    Schema.Struct({
      node_id: Schema.Number,
      delegated: Schema.Struct({
        denom: Schema.String,
        amount: Schema.String,
      }),
      height: Schema.Number,
      proxy: Schema.NullOr(Schema.String),
    })
  ),
  accumulated_rewards: Schema.Array(
    Schema.Struct({
      node_id: Schema.Number,
      rewards: Schema.Struct({
        denom: Schema.String,
        amount: Schema.String,
      }),
      amount_staked: Schema.Struct({
        denom: Schema.String,
        amount: Schema.String,
      }),
      node_still_fully_bonded: Schema.Boolean,
    })
  ),
  total_delegations: Schema.Struct({
    denom: Schema.String,
    amount: Schema.String,
  }),
  claimable_rewards: Schema.Struct({
    denom: Schema.String,
    amount: Schema.String,
  }),
  vesting_account: Schema.NullOr(Schema.String),
  operator_rewards: Schema.NullOr(
    Schema.Struct({
      denom: Schema.String,
      amount: Schema.String,
    })
  ),
}) {
  static nodes(addr: Address) {
    return Effect.reduce(
      addr.accumulated_rewards
        .map((r) => ({
          bond: true,
          id: r.node_id,
        }))
        .concat(
          addr.delegations.map((r) => ({
            bond: false,
            id: r.node_id,
          }))
        ),
      [] as { bond: boolean; node: Node }[],
      (acc, { id, bond }) =>
        Effect.gen(function* () {
          const node = yield* Node.fromExplorer(id);
          return [
            ...acc,
            {
              bond,
              node,
            },
          ];
        })
    );
  }

  static fromExplorer(addr: string) {
    const decode = Schema.decodeUnknown(Address);
    return Effect.gen(function* (_) {
      const cli = yield* HttpClient.HttpClient;
      const resp = yield* cli.get(
        `https://explorer.nymtech.net/api/v1/tmp/unstable/account/${addr}`
      );
      const data = yield* resp.json;
      return yield* decode(data);
    }).pipe(Effect.scoped);
  }

  static prometheusExport(addr: string) {
    return Address.fromExplorer(addr).pipe(
      Effect.flatMap((addr) =>
        Effect.gen(function* () {
          const nodes = yield* Address.nodes(addr).pipe(
            Effect.tapErrorCause(Effect.logError),
            Effect.orElse(() => Effect.succeed([]))
          );
          const extraLabels = nodes.reduce<{
            delegate: string[];
            bond: string[];
          }>(
            (acc, { node, bond }) => {
              const nid =
                node.description.host_information.hostname ?? node.node_id;
              if (bond) {
                acc.bond.push(nid.toString());
                return acc;
              }
              if (!bond) {
                acc.delegate.push(nid.toString());
                return acc;
              }
              return acc;
            },
            { delegate: [], bond: [] }
          );
          return Address.makePrometheusExport(addr, {
            address: addr.address,
            ...{
              delegate: extraLabels.delegate.join(","),
              bond: extraLabels.bond.join(","),
            },
          });
        })
      )
    );
  }

  static Metrics = {
    claimable_rewards: PrometheusMetric.gauge(
      "nym_address_claimable_rewards"
    ).pipe(PrometheusMetric.withHelp("Pending rewards")),
    operator_rewards: PrometheusMetric.gauge(
      "nym_address_operator_rewards"
    ).pipe(PrometheusMetric.withHelp("Pending rewards for the operator")),
    total_value: PrometheusMetric.gauge("nym_address_total_value").pipe(
      PrometheusMetric.withHelp("Total value of the address")
    ),
    total_balance: PrometheusMetric.gauge("nym_address_total_balance").pipe(
      PrometheusMetric.withHelp("Total balanceof the address")
    ),
    total_delegations: PrometheusMetric.gauge(
      "nym_address_total_delegations"
    ).pipe(PrometheusMetric.withHelp("Total delegations")),
  } as const;

  static totalBalances(addr: Address) {
    return (
      addr.balances.reduce((acc, b) => {
        return acc + Number(b.amount);
      }, 0) +
      Number(addr.total_delegations.amount) +
      Number(addr.claimable_rewards.amount) +
      Number(addr.operator_rewards?.amount ?? 0)
    );
  }
  static makePrometheusExport = (addr: Address, labels: PrometheusLabels) => {
    const {
      claimable_rewards,
      operator_rewards,
      total_value,
      total_delegations,
    } = addr;

    const values: Record<keyof typeof Address.Metrics, string | number> = {
      claimable_rewards: claimable_rewards.amount,
      operator_rewards: operator_rewards?.amount ?? 0,
      total_value: total_value.amount,
      total_delegations: total_delegations.amount,
      total_balance: Address.totalBalances(addr),
    };
    return Object.entries(Address.Metrics).reduce((acc, [key, metric]) => {
      const fixedKey = key as unknown as keyof typeof Address.Metrics;
      const exp = metric.pipe(
        PrometheusMetric.exportWith(values[fixedKey], labels)
      );
      return `${acc + PrometheusExport.print(exp)}\n\n`;
    }, "");
  };
}
