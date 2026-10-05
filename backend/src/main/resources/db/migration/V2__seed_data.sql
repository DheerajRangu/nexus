-- AEGIS Seed Data for Demonstration

-- Users ($2a$10$e.g. password = "password")
INSERT INTO users (user_id, username, password_hash, full_name, role, entity_scope_id) VALUES
('usr-sup-01', 'supervisor1', '$2a$10$7Q9E3b2x0F9E.K8g1.e2hO6n1J.oX7a.1234567890abcdefghijklm', 'Sarah Jenkins (Supervisor)', 'ROLE_SUPERVISOR', NULL),
('usr-op-01', 'operator1', '$2a$10$7Q9E3b2x0F9E.K8g1.e2hO6n1J.oX7a.1234567890abcdefghijklm', 'David Miller (Call Intake)', 'ROLE_OPERATOR', NULL),
('usr-drv-01', 'driver1', '$2a$10$7Q9E3b2x0F9E.K8g1.e2hO6n1J.oX7a.1234567890abcdefghijklm', 'Rajesh Kumar (ALS Driver)', 'ROLE_DRIVER', 'AMB-108-NORTH-01'),
('usr-drv-02', 'driver2', '$2a$10$7Q9E3b2x0F9E.K8g1.e2hO6n1J.oX7a.1234567890abcdefghijklm', 'Vikram Singh (BLS Driver)', 'ROLE_DRIVER', 'AMB-108-CENTRAL-02'),
('usr-hosp-01', 'hospadmin1', '$2a$10$7Q9E3b2x0F9E.K8g1.e2hO6n1J.oX7a.1234567890abcdefghijklm', 'Dr. Aris Mehta (ER Director)', 'ROLE_HOSPITAL_STAFF', 'HOSP-CITY-GENERAL-01');

-- Hospitals
INSERT INTO hospitals (hospital_id, name, latitude, longitude, available_beds, available_icu, has_trauma_center, has_cardiac_cath_lab, emergency_workload) VALUES
('HOSP-CITY-GENERAL-01', 'City General Trauma & Emergency Center', 12.9724, 77.5951, 14, 3, TRUE, TRUE, 'NORMAL'),
('HOSP-ST-JUDE-02', 'St. Jude Specialty Hospital', 12.9352, 77.6245, 8, 1, TRUE, FALSE, 'HIGH'),
('HOSP-METRO-CARE-03', 'MetroCare Super Specialty', 12.9850, 77.6080, 2, 0, FALSE, TRUE, 'CRITICAL');

-- Specialist Availability
INSERT INTO specialist_availability (id, hospital_id, specialty, on_duty_count, is_ready) VALUES
('spec-01', 'HOSP-CITY-GENERAL-01', 'CARDIOLOGY', 2, TRUE),
('spec-02', 'HOSP-CITY-GENERAL-01', 'NEUROSURGERY', 1, TRUE),
('spec-03', 'HOSP-ST-JUDE-02', 'ORTHOPEDIC_TRAUMA', 2, TRUE),
('spec-04', 'HOSP-METRO-CARE-03', 'CARDIOLOGY', 1, FALSE);

-- Ambulances
INSERT INTO ambulances (ambulance_id, license_plate, capability_tier, has_ventilator, has_defibrillator, latitude, longitude, is_available, status, assigned_driver_id) VALUES
('AMB-108-NORTH-01', 'KA-01-EQ-9012', 'ALS', TRUE, TRUE, 12.9790, 77.5910, TRUE, 'IDLE', 'usr-drv-01'),
('AMB-108-CENTRAL-02', 'KA-01-EQ-4421', 'BLS', FALSE, TRUE, 12.9680, 77.6010, TRUE, 'IDLE', 'usr-drv-02'),
('AMB-108-SOUTH-03', 'KA-05-EQ-1109', 'ALS', TRUE, TRUE, 12.9210, 77.5840, TRUE, 'IDLE', NULL);

-- Driver Shifts
INSERT INTO driver_shifts (shift_id, driver_id, ambulance_id, start_time, is_active) VALUES
('shf-01', 'usr-drv-01', 'AMB-108-NORTH-01', CURRENT_TIMESTAMP - INTERVAL '2 HOURS', TRUE),
('shf-02', 'usr-drv-02', 'AMB-108-CENTRAL-02', CURRENT_TIMESTAMP - INTERVAL '3 HOURS', TRUE);

-- Initial Roadblock
INSERT INTO roadblocks (roadblock_id, source, latitude, longitude, radius_meters, scope, verified, expires_at) VALUES
('rb-metro-01', 'City Traffic Control (Metro Construction)', 12.9750, 77.5980, 150.0, 'FULL_BLOCK', TRUE, CURRENT_TIMESTAMP + INTERVAL '12 HOURS');

-- 3-Junction Traffic Corridor Signals
INSERT INTO green_corridor_signals (junction_id, name, latitude, longitude, current_state) VALUES
('jnc-01', 'Junction 1: MG Road & Brigade Junction', 12.9740, 77.6070, 'UNAVAILABLE'),
('jnc-02', 'Junction 2: Trinity Circle Signal', 12.9720, 77.6160, 'UNAVAILABLE'),
('jnc-03', 'Junction 3: Domlur Flyover Intersection', 12.9610, 77.6380, 'UNAVAILABLE');
