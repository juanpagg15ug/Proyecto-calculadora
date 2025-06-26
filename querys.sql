CREATE TABLE permisos (
    id INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    categoria VARCHAR(20) NOT NULL, -- Valores posibles: 'matematico', 'booleano', 'administrativo'
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE roles (
    id INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    limite_operaciones_diario INT DEFAULT 10,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    dpi VARCHAR(13) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    rol_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE rol_permisos (
    id SERIAL PRIMARY KEY,
    rol_id INT NOT NULL,
    permiso_id INT NOT NULL,
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT,
    FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE RESTRICT,
    UNIQUE (rol_id, permiso_id)
);

CREATE TABLE historial_operaciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    tipo_operacion VARCHAR(20) NOT NULL, -- Valores posibles: 'matematica', 'booleana'
    expresion_original TEXT NOT NULL,
    expresion_procesada TEXT,
    resultado TEXT,
    estado VARCHAR(20) NOT NULL, -- Valores posibles: 'exitosa', 'error', 'bloqueada'
    mensaje_error TEXT,
    tiempo_ejecucion_ms INT,
    user_agent TEXT,
    fecha_operacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_usuario_fecha ON historial_operaciones (usuario_id, fecha_operacion);
CREATE INDEX idx_fecha_operacion ON historial_operaciones (fecha_operacion);
CREATE INDEX idx_tipo_operacion ON historial_operaciones (tipo_operacion);

CREATE TABLE limites_diarios (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    operaciones_realizadas INT DEFAULT 0,
    limite_maximo INT NOT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE (usuario_id, fecha)
);
-- Insert permissions
INSERT INTO permisos (id, nombre, descripcion, categoria) VALUES
(1, 'calcular_matematicas', 'Realizar operaciones matemáticas básicas', 'matematico'),
(2, 'calcular_potencias', 'Realizar operaciones de potencias', 'matematico'),
(3, 'calcular_booleanas', 'Realizar operaciones booleanas', 'booleano'),
(4, 'ver_historial_propio', 'Ver su propio historial', 'administrativo'),
(5, 'ver_historial_todos', 'Ver historial de todos los usuarios', 'administrativo'),
(6, 'gestionar_usuarios', 'Gestionar usuarios del sistema', 'administrativo');

-- Insert roles
INSERT INTO roles (id, nombre, descripcion, limite_operaciones_diario) VALUES
(1, 'usuario_basico', 'Usuario con permisos básicos', 10),
(2, 'usuario_premium', 'Usuario con permisos extendidos', 100),
(3, 'administrador', 'Administrador del sistema', 1000);

-- Assign permissions to roles
INSERT INTO rol_permisos (rol_id, permiso_id) VALUES
-- Usuario básico
(1, 1), (1, 3), (1, 4),
-- Usuario premium
(2, 1), (2, 2), (2, 3), (2, 4),
-- Administrador
(3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6);

INSERT INTO usuarios (dpi, nombre, email, password_hash, rol_id) VALUES
('1234567890123', 'Usuario Test', 'test@ejemplo.com', 'hashed_password_123', 1),
('3003681430101', 'Juan Gil', 'juanpagilgalindo@gmail.co', 'hashed_password_456', 3);