import os


def get_default_graph_api_version() -> str:
    """Return 'beta' unless USE_GRAPH_BETA is explicitly set to 'false'."""
    return "v1.0" if os.environ.get("USE_GRAPH_BETA") == "false" else "beta"
