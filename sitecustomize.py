"""Runtime compatibility patches for the Delivery Tools Streamlit app."""

import importlib.abc
import re
import sys


def parse_customer_notification_amount(value):
    """Parse currency strings that may use AU/US or European separators."""
    value = str(value).strip()
    if not value:
        return 0.0

    cleaned = re.sub(r"[^0-9,\.\-]", "", value)
    if not cleaned or cleaned in {"-", ".", ","}:
        return 0.0

    last_dot = cleaned.rfind(".")
    last_comma = cleaned.rfind(",")

    if last_dot != -1 and last_comma != -1:
        if last_dot > last_comma:
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif last_comma != -1:
        comma_digits = len(cleaned) - last_comma - 1
        cleaned = cleaned.replace(",", ".") if comma_digits == 2 else cleaned.replace(",", "")
    elif last_dot != -1 and cleaned.count(".") > 1:
        dot_digits = len(cleaned) - last_dot - 1
        if dot_digits != 2:
            cleaned = cleaned.replace(".", "")

    try:
        return float(cleaned)
    except Exception:
        return 0.0


def _patch_module(module):
    if module.__name__.endswith("page_customer_notification"):
        module.parse_amount = parse_customer_notification_amount


class _CustomerNotificationPatchLoader(importlib.abc.Loader):
    def __init__(self, wrapped_loader):
        self.wrapped_loader = wrapped_loader

    def create_module(self, spec):
        create_module = getattr(self.wrapped_loader, "create_module", None)
        if create_module:
            return create_module(spec)
        return None

    def exec_module(self, module):
        self.wrapped_loader.exec_module(module)
        _patch_module(module)


class _CustomerNotificationPatchFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if not fullname.endswith("page_customer_notification"):
            return None
        for finder in sys.meta_path:
            if finder is self:
                continue
            find_spec = getattr(finder, "find_spec", None)
            if not find_spec:
                continue
            spec = find_spec(fullname, path, target)
            if spec and spec.loader:
                spec.loader = _CustomerNotificationPatchLoader(spec.loader)
                return spec
        return None


for _module in list(sys.modules.values()):
    _patch_module(_module)

sys.meta_path.insert(0, _CustomerNotificationPatchFinder())
