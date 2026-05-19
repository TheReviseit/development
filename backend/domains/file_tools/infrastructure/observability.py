"""Structured observability helpers for file tools."""

from __future__ import annotations

import hashlib
import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("file_tools")


try:
    from prometheus_client import Counter, Gauge, Histogram

    _PROMETHEUS = True
except Exception:  # pragma: no cover - exercised when prometheus is not installed.
    Counter = Gauge = Histogram = None  # type: ignore[assignment]
    _PROMETHEUS = False


@dataclass
class _InMemoryVideoMetrics:
    counters: dict[str, float] = field(default_factory=dict)
    gauges: dict[str, float] = field(default_factory=dict)
    histograms: dict[str, list[float]] = field(default_factory=dict)

    def inc(self, name: str, labels: dict[str, Any] | None = None, amount: float = 1.0) -> None:
        self.counters[_metric_key(name, labels)] = self.counters.get(_metric_key(name, labels), 0.0) + amount

    def set(self, name: str, value: float, labels: dict[str, Any] | None = None) -> None:
        self.gauges[_metric_key(name, labels)] = value

    def observe(self, name: str, value: float, labels: dict[str, Any] | None = None) -> None:
        self.histograms.setdefault(_metric_key(name, labels), []).append(value)


_memory_video_metrics = _InMemoryVideoMetrics()
_video_prometheus: dict[str, Any] = {}


def hash_identifier(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def log_event(event: str, **fields: Any) -> None:
    safe_fields = {
        key: value
        for key, value in fields.items()
        if value is not None
    }
    logger.info("[file_tools] %s %s", event, safe_fields)


def log_failure(event: str, **fields: Any) -> None:
    safe_fields = {
        key: value
        for key, value in fields.items()
        if value is not None
    }
    logger.warning("[file_tools] %s %s", event, safe_fields)


def observe_video_histogram(name: str, value: float, **labels: Any) -> None:
    metric = _prometheus_metric(name, "histogram", labels)
    if metric is not None:
        if labels:
            metric.labels(**_label_values(labels)).observe(value)
        else:
            metric.observe(value)
        return
    _memory_video_metrics.observe(name, value, labels)


def increment_video_counter(name: str, amount: float = 1.0, **labels: Any) -> None:
    metric = _prometheus_metric(name, "counter", labels)
    if metric is not None:
        if labels:
            metric.labels(**_label_values(labels)).inc(amount)
        else:
            metric.inc(amount)
        return
    _memory_video_metrics.inc(name, labels, amount)


def set_video_gauge(name: str, value: float, **labels: Any) -> None:
    metric = _prometheus_metric(name, "gauge", labels)
    if metric is not None:
        if labels:
            metric.labels(**_label_values(labels)).set(value)
        else:
            metric.set(value)
        return
    _memory_video_metrics.set(name, value, labels)


@contextmanager
def video_histogram_timer(name: str, **labels: Any):
    started = time.perf_counter()
    try:
        yield
    finally:
        observe_video_histogram(name, time.perf_counter() - started, **labels)


def video_metrics_snapshot() -> dict[str, Any]:
    return {
        "prometheus": _PROMETHEUS,
        "counters": dict(_memory_video_metrics.counters),
        "gauges": dict(_memory_video_metrics.gauges),
        "histograms": {key: len(values) for key, values in _memory_video_metrics.histograms.items()},
    }


def _prometheus_metric(name: str, kind: str, labels: dict[str, Any]) -> Any | None:
    if not _PROMETHEUS:
        return None
    label_names = tuple(sorted(labels.keys()))
    key = f"{kind}:{name}:{','.join(label_names)}"
    if key in _video_prometheus:
        return _video_prometheus[key]
    description = name.replace("_", " ")
    try:
        if kind == "histogram":
            metric = Histogram(name, description, label_names)
        elif kind == "counter":
            metric = Counter(name, description, label_names)
        else:
            metric = Gauge(name, description, label_names)
    except ValueError:
        return None
    _video_prometheus[key] = metric
    return metric


def _label_values(labels: dict[str, Any]) -> dict[str, str]:
    return {key: str(value) for key, value in labels.items()}


def _metric_key(name: str, labels: dict[str, Any] | None) -> str:
    if not labels:
        return name
    label_text = ",".join(f"{key}={labels[key]}" for key in sorted(labels))
    return f"{name}{{{label_text}}}"
