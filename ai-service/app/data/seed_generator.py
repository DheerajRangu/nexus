"""Synthetic ETA training pipeline. Metrics are demo-only."""
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

DISCLAIMER = "pipeline demo only, synthetic data"


def generate_synthetic_trips(num_samples=1000, seed=42, num_missions=50):
    rng = np.random.RandomState(seed)
    mission_ids = [f"msn-syn-{i % num_missions:03d}" for i in range(num_samples)]
    # Time-ordered within each mission via sequence index
    seq = np.arange(num_samples)
    base_distances = rng.uniform(1.0, 25.0, num_samples)
    base_etas = base_distances * rng.uniform(2.0, 3.5, num_samples)
    hours = rng.randint(0, 24, num_samples)
    traffic_multipliers = np.where(
        ((hours >= 8) & (hours <= 10)) | ((hours >= 17) & (hours <= 20)), 1.6, 1.1
    )
    weather_impact = rng.choice([0.0, 1.5, 3.0], num_samples, p=[0.7, 0.2, 0.1])
    realized_etas = (base_etas * traffic_multipliers) + weather_impact + rng.normal(0, 1.2, num_samples)
    realized_etas = np.maximum(realized_etas, base_etas)

    return pd.DataFrame({
        "mission_id": mission_ids,
        "seq": seq,
        "base_distance_km": base_distances,
        "base_eta_mins": base_etas,
        "hour_of_day": hours,
        "traffic_multiplier": traffic_multipliers,
        "weather_impact": weather_impact,
        "realized_eta_mins": realized_etas,
    })


def _mission_grouped_time_split(df: pd.DataFrame, train_frac: float = 0.8):
    """Hold out later sequences per mission; no future leakage within a mission."""
    train_parts = []
    test_parts = []
    for _, group in df.groupby("mission_id", sort=True):
        g = group.sort_values("seq")
        cut = max(1, int(len(g) * train_frac))
        if cut >= len(g):
            cut = len(g) - 1
        train_parts.append(g.iloc[:cut])
        test_parts.append(g.iloc[cut:])
    return pd.concat(train_parts), pd.concat(test_parts)


def train_and_save_eta_model(output_dir="model_artifacts", seed=42):
    os.makedirs(output_dir, exist_ok=True)
    df = generate_synthetic_trips(seed=seed)
    train_df, test_df = _mission_grouped_time_split(df)

    features = ["base_distance_km", "base_eta_mins", "hour_of_day", "traffic_multiplier"]
    model = RandomForestRegressor(n_estimators=50, random_state=seed)
    model.fit(train_df[features], train_df["realized_eta_mins"])

    y_pred = model.predict(test_df[features])
    y_true = test_df["realized_eta_mins"].to_numpy()
    y_base = test_df["base_eta_mins"].to_numpy()

    mae_ml = float(mean_absolute_error(y_true, y_pred))
    mae_baseline = float(mean_absolute_error(y_true, y_base))
    errors = (y_pred - y_true).tolist()
    # Round for stable JSON / identical retrain comparison
    err_hist = defaultdict(int)
    for e in errors:
        bucket = round(e, 1)
        err_hist[str(bucket)] += 1

    metrics = {
        "model_version": "aegis-eta-regressor-v1",
        "disclaimer": DISCLAIMER,
        "split": "mission-grouped time-ordered",
        "seed": seed,
        "trained_samples": int(len(train_df)),
        "test_samples": int(len(test_df)),
        "mae_ml_mins": round(mae_ml, 4),
        "mae_baseline_mins": round(mae_baseline, 4),
        "mae_improvement_vs_uncorrected": round(mae_baseline - mae_ml, 4),
        "error_distribution_rounded_1dp": dict(sorted(err_hist.items(), key=lambda kv: float(kv[0]))),
    }

    path = os.path.join(output_dir, "eta_metrics.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, sort_keys=True)

    print(
        f"ETA Model trained. MAE ML: {mae_ml:.4f} vs baseline: {mae_baseline:.4f} [{DISCLAIMER}]"
    )
    return model, metrics


if __name__ == "__main__":
    train_and_save_eta_model()
