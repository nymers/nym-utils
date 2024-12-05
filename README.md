# nym-utils

To install dependencies:

```bash
bun install
```

To run:

## Prometheus exporter

### Run the server

```bash
bun run index.ts exporter
```

### Try it out

```
curl "http://127.0.0.1:9100/metrics?id=14&id=1213&address=n1yv7smmmzsrqx88gze33sq6a02tn5u6ge808quz"
```

### Setup prometheus job

```
  - job_name: 'nymers-nodes-data'
    metrics_path: '/metrics/'
    params:
      id: ['1613', '14', '2129', '2005']
      address: [
        'n1yv7smmmzsrqx88gze33sq6a02tn5u6ge808quz',
    ]
    scrape_interval: 300s
    static_configs:
      - targets:
        - 'host:9001'
```

## Node info

```
bun run index.ts node --node 14
```

## Address info

```
bun run index.ts addr --address n1yv7smmmzsrqx88gze33sq6a02tn5u6ge808quz
```
