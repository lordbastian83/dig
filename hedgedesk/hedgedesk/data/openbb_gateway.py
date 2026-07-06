"""Back-compat shim.

The gateway grew from OpenBB-only into a multi-provider chain (see gateway.py).
This module preserves the original import path. New code should import from
``hedgedesk.data.gateway``.
"""

from .gateway import DataGateway, OpenBBGateway  # noqa: F401
