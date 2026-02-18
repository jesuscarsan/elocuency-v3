#!/bin/bash
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}      Elo Server Setup (Docker)         ${NC}"
echo -e "${GREEN}========================================${NC}"

# 1. Check Dependencies
echo -e "\n${YELLOW}[1/4] Checking dependencies...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: 'docker' is not installed.${NC}"
    echo "Please install Docker Desktop or Docker Engine first."
    exit 1
fi

# Check for docker compose (v2) or docker-compose (v1)
DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}Error: 'docker compose' is not installed.${NC}"
    exit 1
fi

echo "Docker is available: $(${DOCKER_COMPOSE_CMD} version)"

# 2. Environment Configuration
echo -e "\n${YELLOW}[2/4] Configuring environment...${NC}"

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch "$ENV_FILE"
fi

# Function to prompt for a variable if not set in .env
prompt_var() {
    local var_name=$1
    local prompt_text=$2
    local default_value=$3
    local current_value

    # Check if var exists in .env
    current_value=$(grep "^${var_name}=" "$ENV_FILE" | cut -d '=' -f2-)

    if [ -n "$current_value" ]; then
        echo "  - $var_name is already set."
    else
        echo -ne "  $prompt_text"
        if [ -n "$default_value" ]; then
            echo -ne " [${default_value}]"
        fi
        echo -ne ": "
        read -r input_value

        # Use default if input is empty
        if [ -z "$input_value" ] && [ -n "$default_value" ]; then
            input_value="$default_value"
        fi

        # If we have a value (input or default), save it
        if [ -n "$input_value" ]; then
            echo "$var_name=$input_value" >> "$ENV_FILE"
        else
            echo -e "${RED}Warning: $var_name was left empty.${NC}"
        fi
    fi
}

prompt_var "GOOGLE_API_KEY" "Enter your Google API Key (Gemini)" ""
prompt_var "OBSIDIAN_API_KEY" "Enter your Obsidian API Key" "obsidian-secret-key"
prompt_var "OBSIDIAN_URL" "Enter your Obsidian URL (e.g., http://host.docker.internal:27124)" "http://host.docker.internal:27124"
prompt_var "NGROK_AUTHTOKEN" "Enter your Ngrok Authtoken" ""

# Special handling for VAULT_PATH to ensure it is absolute
current_vault=$(grep "^VAULT_PATH=" "$ENV_FILE" | cut -d '=' -f2-)
if [ -z "$current_vault" ]; then
    echo -ne "  Enter the absolute path to your Obsidian Vault [$(pwd)/vault]: "
    read -r input_vault
    if [ -z "$input_vault" ]; then
        input_vault="$(pwd)/vault"
    fi
    # Create directory if it doesn't exist (unless it's a system path meant to start with /)
    # Actually, let's just use it.
    echo "VAULT_PATH=$input_vault" >> "$ENV_FILE"
else
     echo "  - VAULT_PATH is already set."
fi

# 3. Network & Config Check
echo -e "\n${YELLOW}[3/4] preparing configuration...${NC}"
mkdir -p workspace/logs workspace/n8n/workflows workspace/n8n/data

# 4. Start Services
echo -e "\n${YELLOW}[4/4] Starting services...${NC}"
echo "Building and starting Docker containers..."

# Build and Start
$DOCKER_COMPOSE_CMD up -d --build

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}Success! Elo Server is running.${NC}"
    echo "  - Helper API: http://localhost:8001"
    echo "  - n8n Automation: http://localhost:5678"
    echo "  - Logs: tail -f workspace/logs/elo-server.log"
else
    echo -e "\n${RED}Failed to start services.${NC}"
    exit 1
fi
