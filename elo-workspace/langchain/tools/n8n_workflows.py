from langchain_core.tools import tool
import requests
import json
import os

# Configuration from environment variables for Docker compatibility
# Defaults are set for standard local development
N8N_WORKFLOWS_DIR = os.getenv("N8N_WORKFLOWS_DIR", "/app/workspace/n8n/workflows")
N8N_BASE_URL = os.getenv("N8N_HOST", "http://localhost:5678")

@tool
def call_n8n_workflow(workflow_name: str, data: dict) -> str:
    """
    Triggers an n8n workflow by name. 
    It looks for the workflow's JSON file in the workspace to find the webhook path.
    'data' is the JSON body to send to the workflow.
    """
    try:
        # 1. Find the workflow file
        filename = f"{workflow_name}.json"
        filepath = os.path.join(N8N_WORKFLOWS_DIR, filename)
        
        if not os.path.exists(filepath):
            # Try searching for it (case insensitive)
            if not os.path.exists(N8N_WORKFLOWS_DIR):
                return f"Error: Workflows directory '{N8N_WORKFLOWS_DIR}' not found."
                
            all_files = os.listdir(N8N_WORKFLOWS_DIR)
            found = False
            for f in all_files:
                if f.lower() == filename.lower():
                    filepath = os.path.join(N8N_WORKFLOWS_DIR, f)
                    found = True
                    break
            if not found:
                return f"Error: Workflow '{workflow_name}' not found in {N8N_WORKFLOWS_DIR}."

        # 2. Extract Webhook URL (simplified assumption: first webhook node)
        with open(filepath, 'r') as f:
            workflow_data = json.load(f)
            
        webhook_path = None
        for node in workflow_data.get('nodes', []):
            if node.get('type') == 'n8n-nodes-base.webhook' or node.get('type') == 'n8n-nodes-base.webhookPublic':
                webhook_path = node.get('parameters', {}).get('path')
                break
        
        if not webhook_path:
             return f"Error: Workflow '{workflow_name}' has no Webhook node."

        # 3. Call the webhook
        url = f"{N8N_BASE_URL}/webhook/{webhook_path}"
        response = requests.post(url, json=data, timeout=10)
        
        if response.status_code == 200:
            return f"Success: Workflow '{workflow_name}' triggered. Response: {response.text}"
        else:
            return f"Error: Failed to trigger workflow. Status: {response.status_code}, Response: {response.text}"

    except requests.exceptions.ConnectionError:
        return f"Error: Could not connect to n8n at {N8N_BASE_URL}. Ensure the service is running."
    except Exception as e:
        return f"Error: {str(e)}"

@tool
def list_n8n_workflows() -> str:
    "Lists all n8n workflows available in the flat-file storage."
    try:
        if not os.path.exists(N8N_WORKFLOWS_DIR):
            return f"Error: Workflows directory '{N8N_WORKFLOWS_DIR}' not found."
            
        files = [f.replace('.json', '') for f in os.listdir(N8N_WORKFLOWS_DIR) if f.endswith('.json')]
        if not files:
            return "No workflows found in flat-file storage."
        return "Available workflows: " + ", ".join(files)
    except Exception as e:
        return f"Error: {str(e)}"
