import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
import os
import json

def generate_synthetic_trips(num_samples=1000, seed=42):
    np.random.seed(seed)
    
    # Simulate historical emergency trip data
    base_distances = np.random.uniform(1.0, 25.0, num_samples)
    base_etas = base_distances * np.random.uniform(2.0, 3.5, num_samples) # ~2-3.5 mins/km base speed
    hours = np.random.randint(0, 24, num_samples)
    traffic_multipliers = np.where((hours >= 8) & (hours <= 10) | (hours >= 17) & (hours <= 20), 1.6, 1.1)
    weather_impact = np.random.choice([0.0, 1.5, 3.0], num_samples, p=[0.7, 0.2, 0.1])
    
    # Realized travel time with noise
    realized_etas = (base_etas * traffic_multipliers) + weather_impact + np.random.normal(0, 1.2, num_samples)
    realized_etas = np.maximum(realized_etas, base_etas)
    
    df = pd.DataFrame({
        'base_distance_km': base_distances,
        'base_eta_mins': base_etas,
        'hour_of_day': hours,
        'traffic_multiplier': traffic_multipliers,
        'weather_impact': weather_impact,
        'realized_eta_mins': realized_etas
    })
    return df

def train_and_save_eta_model(output_dir="model_artifacts"):
    os.makedirs(output_dir, exist_ok=True)
    df = generate_synthetic_trips()
    
    # Chronological split
    train_size = int(len(df) * 0.8)
    train_df = df.iloc[:train_size]
    test_df = df.iloc[train_size:]
    
    X_train = train_df[['base_distance_km', 'base_eta_mins', 'hour_of_day', 'traffic_multiplier']]
    y_train = train_df['realized_eta_mins']
    
    X_test = test_df[['base_distance_km', 'base_eta_mins', 'hour_of_day', 'traffic_multiplier']]
    y_test = test_df['realized_eta_mins']
    
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    baseline_mae = mean_absolute_error(y_test, test_df['base_eta_mins'])
    
    metrics = {
        "model_version": "aegis-eta-regressor-v1",
        "trained_samples": train_size,
        "test_samples": len(test_df),
        "mae_ml_mins": round(mae, 2),
        "mae_baseline_mins": round(baseline_mae, 2),
        "improvement_pct": round((1 - mae/baseline_mae) * 100, 1)
    }
    
    with open(os.path.join(output_dir, "eta_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
        
    print(f"ETA Model trained successfully. MAE ML: {mae:.2f} mins vs Baseline: {baseline_mae:.2f} mins")
    return model, metrics

if __name__ == "__main__":
    train_and_save_eta_model()
