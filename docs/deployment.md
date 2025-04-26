# Deployment Examples

This document provides deployment examples for running the application in different environments.

Choose the deployment option that best fits your setup.

- **[Local GPU](#local-gpu)**: For deploying the application locally on a machine with a NVIDIA GPU (using Docker Compose).
- **[OpenShift](#openshift)**: For deploying the application on an OpenShift cluster, designed for cloud-native environments.
- **[Cloudflare](#cloudflare)**: For deploying the application as a Cloudflare Worker.

---

## Local GPU

### Docker compose

Manifest example: [compose-gpu.yaml](./deploy-examples/compose-gpu.yaml)

This deployment has the following features:

- NVIDIA cuda enabled

Install the app with:

```sh
docker compose -f docs/deploy-examples/compose-gpu.yaml up -d
```

For using the API:

```sh
# Make a test query
curl -X 'POST' \
  "localhost:5001/v1alpha/convert/source/async" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "http_sources": [{"url": "https://arxiv.org/pdf/2501.17887"}]
  }'
```

<details>
<summary><b>Requirements</b></summary>

- debian/ubuntu/rhel/fedora/opensuse
- docker
- nvidia drivers >=550.54.14
- nvidia-container-toolkit

Docs:

- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/supported-platforms.html)
- [CUDA Toolkit Release Notes](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#id6)

</details>

<details>
<summary><b>Steps</b></summary>

1. Check driver version and which GPU you want to use (0/1/2/3.. and update [compose-gpu.yaml](./deploy-examples/compose-gpu.yaml) file or use `count: all`)

    ```sh
    nvidia-smi
    ```

2. Check if the NVIDIA Container Toolkit is installed/updated

    ```sh
    # debian
    dpkg -l | grep nvidia-container-toolkit
    ```

    ```sh
    # rhel
    rpm -q nvidia-container-toolkit
    ```

    NVIDIA Container Toolkit install steps can be found here:

    <https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html>

3. Check which runtime is being used by Docker

    ```sh
    # docker
    docker info | grep -i runtime
    ```

4. If the default Docker runtime changes back from 'nvidia' to 'default' after restarting the Docker service (optional):

    Backup the daemon.json file:

    ```sh
    sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
    ```

    Update the daemon.json file:

    ```sh
    echo '{
      "runtimes": {
        "nvidia": {
          "path": "nvidia-container-runtime"
        }
      },
      "default-runtime": "nvidia"
    }' | sudo tee /etc/docker/daemon.json > /dev/null
    ```

    Restart the Docker service:

    ```sh
    sudo systemctl restart docker
    ```

    Confirm 'nvidia' is the default runtime used by Docker by repeating step 3.

5. Run the container:

    ```sh
    docker compose -f docs/deploy-examples/compose-gpu.yaml up -d
    ```

</details>

## OpenShift

### Simple deployment

Manifest example: [docling-serve-simple.yaml](./deploy-examples/docling-serve-simple.yaml)

This deployment example has the following features:

- Deployment configuration
- Service configuration
- NVIDIA cuda enabled

Install the app with:

```sh
oc apply -f docs/deploy-examples/docling-serve-simple.yaml
```

For using the API:

```sh
# Port-forward the service
oc port-forward svc/docling-serve 5001:5001

# Make a test query
curl -X 'POST' \
  "localhost:5001/v1alpha/convert/source/async" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "http_sources": [{"url": "https://arxiv.org/pdf/2501.17887"}]
  }'
```

### Secure deployment with `oauth-proxy`

Manifest example: [docling-serve-oauth.yaml](./deploy-examples/docling-serve-oauth.yaml)

This deployment has the following features:

- TLS encryption between all components (using the cluster-internal CA authority).
- Authentication via a secure `oauth-proxy` sidecar.
- Expose the service using a secure OpenShift `Route`

Install the app with:

```sh
oc apply -f docs/deploy-examples/docling-serve-oauth.yaml
```

For using the API:

```sh
# Retrieve the endpoint
DOCLING_NAME=docling-serve
DOCLING_ROUTE="https://$(oc get routes ${DOCLING_NAME} --template={{.spec.host}})"

# Retrieve the authentication token
OCP_AUTH_TOKEN=$(oc whoami --show-token)

# Make a test query
curl -X 'POST' \
  "${DOCLING_ROUTE}/v1alpha/convert/source/async" \
  -H "Authorization: Bearer ${OCP_AUTH_TOKEN}" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "http_sources": [{"url": "https://arxiv.org/pdf/2501.17887"}]
  }'
```

## Cloudflare

### Worker deployment

This deployment has the following features:

- Serverless architecture using Cloudflare Workers
- Document storage in Cloudflare D1 SQL database
- Lower latency due to edge network deployment
- Default `gpt-4o-mini` model configuration

#### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Cloudflare account
- Cloudflare Workers subscription
- Cloudflare D1 database access
- Wrangler CLI configured with your account

#### Setup Steps

1. Configure your Cloudflare account in `wrangler.toml`

2. Create D1 database:

```sh
npx wrangler d1 create docling_documents
```

3. Update the `database_id` in `wrangler.toml` with the ID returned from the command above

4. Initialize the database schema:

```sh
npx wrangler d1 execute docling_documents --file=schema.sql
```

5. Deploy to Cloudflare:

```sh
npx wrangler deploy
```

#### Configuration Options

The following environment variables can be configured in the `wrangler.toml` file:

```toml
[vars]
DOCLING_SERVE_ENABLE_UI = "false"
DOCLING_SERVE_API_HOST = "localhost"
DOCLING_SERVE_MAX_NUM_PAGES = "1000"
DOCLING_SERVE_MAX_FILE_SIZE = "104857600" # 100MB
DEFAULT_MODEL = "gpt-4o-mini"
```

#### Testing the Deployment

Once deployed, test the API using:

```sh
# Retrieve your worker URL (replace with your actual URL)
WORKER_URL="https://docling-cf.example.workers.dev"

# Make a test query
curl -X 'POST' \
  "${WORKER_URL}/v1alpha/convert/source/async" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "http_sources": [{"url": "https://arxiv.org/pdf/2501.17887"}]
  }'
```

<details>
<summary><b>Limitations</b></summary>

- Cloudflare Workers have execution time limits (30 seconds for paid plans)
- D1 database has size limitations for query results and content storage
- The serverless architecture may require adaptations for long-running processing tasks
- High-compute operations like large document processing should be broken into smaller tasks

</details>

<details>
<summary><b>Monitoring and Debugging</b></summary>

After deployment, you can monitor and debug your Cloudflare Worker using:

- The Cloudflare Dashboard for performance metrics and logs
- Wrangler for local development and testing:

```sh
# Run locally for testing
npx wrangler dev
```

- Tail logs from your deployed worker:

```sh
npx wrangler tail
```

</details>
