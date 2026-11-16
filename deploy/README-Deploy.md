# GitHub Actions Workflow

The workflow runs on pull requests and on pushes to `main` or `test/deployment`.

## On a pull request

The backend tests and frontend lint, tests, and build run. The workflow does not connect to Google Cloud or deploy.

## On a push to the test branch `test/deployment`

1. The backend tests and frontend lint, tests, and build run.
2. The Google Cloud connection job authenticates with GitHub OIDC and connects to the configured VM.
3. It runs `hostname` to verify SSH access.

## On a push to production `main`

1. The backend tests and frontend lint, tests, and build run. Tests must pass before deployment.
2. The deploy job builds the frontend for a release package. 
3. Checks for github environment variables
   - Mandatory Variables: `GEMINI_API_KEY` and `SEATSAERO_TOKEN`
   - Optional Vairbales: `GEMINI_MODEL`, `SEATSAERO_BASE_URL`, `DOMAIN`, and `CERTBOT_EMAIL`
4. Writes the application settings to a temp `.env` file and include it with the release package.
5. Authenticate with with github OIDC, connects with the instance and deliver the package
6. Runs `deploy/launch.sh` on the instance. 
   - The bash script installs required packages and python dependencies, updates the application, configures Gunicorn under systemd and Nginx to serve the frontend and proxy API requests. If both `DOMAIN` and `CERTBOT_EMAIL` are set, it also configures HTTPS with Certbot.

The deployment also needs the `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT`, `GCP_ZONE`, and `GCP_INSTANCE` secrets. See details in the `Google Cloud Configuration` Section

# Google Cloud Configuration
## 1. Create or select a Google Cloud project

 In the Google Cloud, create or select a project of the web server and choose an appropriate zone and machine type.

## 2. Enable the required APIs
In the Google Cloud Console API Library, enable these APIs:

- Compute Engine API (`compute.googleapis.com`)
- Cloud Identity-Aware Proxy API (`iap.googleapis.com`)
- Identity and Access Management (IAM) API (`iam.googleapis.com`)
- IAM Service Account Credentials API (`iamcredentials.googleapis.com`)
- Security Token Service API (`sts.googleapis.com`)

## 3. Create or check the VM

Use the Google Cloud Console to create a VM. Choose an approriate machine size and zone. The deployment script is intended for Ubuntu 24.04 LTS and it should work on other debian-based distros. 

## 4. Configure the VM firewall

Add network tags to the VM:
- `http-server` for public web traffic.
- `https-server` for public web traffic via https
- `iap-ssh` for SSH access.
Do not expose SSH to public or add a rule allowing SSH from `0.0.0.0/0`. 

The above configuration should come as default for the VM with `http-server` tag enabled, this automatically applies the default web server firewall configuration.

## 5. Create and authorize a deployer service account

 Create a dedicated service account for GitHub Actions (for example, `github-deployer`). Grant it these roles on the project:

- Compute Instance Admin (v1): read and manage the Compute Engine VM.
- IAP-secured Tunnel User: connect to the VM through IAP.
- Compute OS Admin Login: sign in to the VM with administrative OS Login access.

This account is used by GitHub Actions to connect to the VM via IAP and os login.

## 6. Set up Workload Identity Federation

Create a Workload Identity pool and an OIDC provider with these settings:

- Pool location: Global
- Provider type: OIDC
- Issuer URL: `https://token.actions.githubusercontent.com`
- Attribute mapping: map `google.subject` to `assertion.sub` and `attribute.repository` to `assertion.repository`
- Attribute condition: restrict access to your exact GitHub repository, for example `assertion.repository == 'rjisoo/cs467-optimiles'`

Record the pool ID, provider ID, and Google Cloud project number for configuring GitHub secrets.

On the deployer service account, grant Workload Identity User to the GitHub repository principal set.
```
principalSet://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/{POOL_ID}/attribute.repository/OWNER/REPO
```

## 7. Configure GitHub Environments and secrets

Add these secrets so Github can authenticate and locate the VM:

| Secret | Value |
|---|---|
| `GCP_WIF_PROVIDER` | Example: `projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/{POOL_ID}/providers/PROVIDER_ID` |
| `GCP_SERVICE_ACCOUNT` | Deployer Service Account Email `github-deployer@TEST_PROJECT.iam.gserviceaccount.com` |
| `GCP_PROJECT` | Google Cloud project ID |
| `GCP_ZONE` | Instance zone |
| `GCP_INSTANCE` | Instance name |

Optional Vairables:

| Variable | Purpose |
|---|---|
| `DOMAIN` | Domain name for the site |
| `CERTBOT_EMAIL` | Email for Let's Encrypt |

The Workload Identity provider must map `attribute.repository` to `assertion.repository` and restrict authentication to the exact repository - `assertion.repository == 'rjisoo/cs467-optimiles'`. The deployer service account must grant Workload Identity User to the repository principal set:

```text
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository/OWNER/REPO
```

## 8. Test the connection and verify deployment
Tests run on PR merges to the `main` branch, after the deploy job succeeds, visit `http://{WEBSITE_URL}/api/health`.
3. To monitor the daemon, connect to the instance and run:

   ```bash
   sudo systemctl status OptiMiles
   sudo journalctl -u OptiMiles -n 50
   ```
