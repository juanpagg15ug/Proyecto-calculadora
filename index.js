const prompt = require('prompt-sync')();
const sequelize = require('./config/database'); 

// Variables globales
let usuarioActual = null;
let dpiValido = false;

// Funciones de validación DPI
function esDPIValido(dpi) {
    const dpiRegex = /^\d{13}$/;
    return dpiRegex.test(dpi);
}

async function validarDPI() {
    let intentos = 0;
    const maxIntentos = 3;

    while (!dpiValido && intentos < maxIntentos) {
        const dpi = prompt('Ingrese su DPI (13 dígitos): ');
        
        if (esDPIValido(dpi)) {
            console.log('✅ DPI válido');
            dpiValido = true;
            return true;
        } else {
            intentos++;
            console.error(`❌ DPI inválido. Debe tener exactamente 13 dígitos numéricos. Intentos restantes: ${maxIntentos - intentos}`);
        }
    }

    if (!dpiValido) {
        console.error('❌ Máximo número de intentos alcanzado. Saliendo del programa.');
        process.exit(1);
    }
}

// Funciones de base de datos
async function inicializarBaseDatos() {
    try {
        await sequelize.authenticate();
        console.log('Conexión a la base de datos establecida correctamente.');
        return true;
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        return false;
    }
}

async function crearUsuario() {
    console.log("Creando usuario...");
    
    const dpi = prompt('Introduce el DPI (13 dígitos): ');
    if (!esDPIValido(dpi)) {
        console.log('Error: DPI inválido');
        return;
    }

    const nombre = prompt('Introduce el nombre completo: ');
    const email = prompt('Introduce el correo electrónico: ');
    const password = prompt('Introduce la contraseña: ');
    
    console.log('\nRoles disponibles:');
    console.log('1. Usuario Básico (10 operaciones/día)');
    console.log('2. Usuario Premium (100 operaciones/día)');
    console.log('3. Administrador (1000 operaciones/día)');
    
    const rolOpcion = prompt('Selecciona el rol (1-3): ');
    let rolId;
    
    switch(rolOpcion) {
        case '1': rolId = 1; break;
        case '2': rolId = 2; break;
        case '3': rolId = 3; break;
        default:
            console.log('Opción inválida');
            return;
    }

    try {
        const [resultado] = await sequelize.query(
            `INSERT INTO usuarios (dpi, nombre, email, password_hash, rol_id) 
             VALUES (:dpi, :nombre, :email, :password, :rolId) 
             RETURNING id, nombre, email`,
            {
                replacements: { dpi, nombre, email, password, rolId }
            }
        );
        
        console.log('✅ Usuario creado exitosamente:', resultado[0]);
    } catch (error) {
        if (error.message.includes('duplicate key')) {
            console.log('❌ Error: El DPI o email ya existe');
        } else {
            console.log('❌ Error:', error.message);
        }
    }
}

async function iniciarSesion() {
    console.log("Iniciando sesión...");
    
    const dpi = prompt('Introduce tu DPI: ');
    const password = prompt('Introduce tu contraseña: ');
    
    try {
        const [usuarios] = await sequelize.query(
            `SELECT u.id, u.dpi, u.nombre, u.email, u.rol_id, r.nombre as rol_nombre, 
                    r.limite_operaciones_diario
             FROM usuarios u 
             JOIN roles r ON u.rol_id = r.id 
             WHERE u.dpi = :dpi AND u.password_hash = :password AND u.activo = true`,
            {
                replacements: { dpi, password }
            }
        );

        if (usuarios.length > 0) {
            usuarioActual = usuarios[0];
            console.log('✅ Inicio de sesión exitoso');
            console.log(`Bienvenido ${usuarioActual.nombre} (${usuarioActual.rol_nombre})`);
            return true;
        } else {
            console.log('❌ Credenciales incorrectas');
            return false;
        }
    } catch (error) {
        console.log('❌ Error al iniciar sesión:', error.message);
        return false;
    }
}

// Funciones de permisos
async function verificarPermiso(permisoNombre) {
    try {
        const [permisos] = await sequelize.query(
            `SELECT p.id FROM permisos p
             JOIN rol_permisos rp ON p.id = rp.permiso_id
             WHERE rp.rol_id = :rolId AND p.nombre = :permisoNombre`,
            {
                replacements: { 
                    rolId: usuarioActual.rol_id, 
                    permisoNombre: permisoNombre 
                }
            }
        );
        
        return permisos.length > 0;
    } catch (error) {
        console.log('Error verificando permisos:', error.message);
        return false;
    }
}

async function verificarLimiteOperaciones() {
    try {
        const fechaHoy = new Date().toISOString().split('T')[0];
        
        // Obtener o crear registro de límite diario
        let [limites] = await sequelize.query(
            `SELECT operaciones_realizadas, limite_maximo 
             FROM limites_diarios 
             WHERE usuario_id = :usuarioId AND fecha = :fecha`,
            {
                replacements: { 
                    usuarioId: usuarioActual.id, 
                    fecha: fechaHoy 
                }
            }
        );

        if (limites.length === 0) {
            // Crear registro si no existe
            await sequelize.query(
                `INSERT INTO limites_diarios (usuario_id, fecha, operaciones_realizadas, limite_maximo)
                 VALUES (:usuarioId, :fecha, 0, :limiteMaximo)`,
                {
                    replacements: {
                        usuarioId: usuarioActual.id,
                        fecha: fechaHoy,
                        limiteMaximo: usuarioActual.limite_operaciones_diario
                    }
                }
            );
            return { puede: true, realizadas: 0, limite: usuarioActual.limite_operaciones_diario };
        }

        const limite = limites[0];
        const puede = limite.operaciones_realizadas < limite.limite_maximo;
        
        return {
            puede: puede,
            realizadas: limite.operaciones_realizadas,
            limite: limite.limite_maximo
        };
    } catch (error) {
        console.log('Error verificando límites:', error.message);
        return { puede: false, realizadas: 0, limite: 0 };
    }
}

async function incrementarContadorOperaciones() {
    try {
        const fechaHoy = new Date().toISOString().split('T')[0];
        
        await sequelize.query(
            `UPDATE limites_diarios 
             SET operaciones_realizadas = operaciones_realizadas + 1,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE usuario_id = :usuarioId AND fecha = :fecha`,
            {
                replacements: { 
                    usuarioId: usuarioActual.id, 
                    fecha: fechaHoy 
                }
            }
        );
    } catch (error) {
        console.log('Error actualizando contador:', error.message);
    }
}

// Funciones de operaciones matemáticas
function procesarExpresionMatematica(expresion) {
    const operadores = {
        'SUMA': '+',
        'RESTA': '-',
        'MULTIPLICA': '*',
        'DIVIDE': '/'
    };

    let expresionProcesada = expresion.toUpperCase();
    
    for (const [palabra, simbolo] of Object.entries(operadores)) {
        expresionProcesada = expresionProcesada.replace(new RegExp(palabra, 'g'), simbolo);
    }

    try {
        // Evaluación simple y segura
        const resultado = Function('"use strict"; return (' + expresionProcesada + ')')();
        return resultado;
    } catch (error) {
        throw new Error('Expresión matemática inválida');
    }
}

function evaluarExpresionBooleana(expresion) {
    const expresionLimpia = expresion
        .replace(/\btrue\b/gi, 'true')
        .replace(/\bfalse\b/gi, 'false')
        .replace(/\bAND\b/gi, '&&')
        .replace(/\bOR\b/gi, '||')
        .replace(/\bNOT\b/gi, '!');

    try {
        const resultado = Function('"use strict"; return (' + expresionLimpia + ')')();
        return resultado;
    } catch (error) {
        throw new Error('Expresión booleana inválida');
    }
}

// Función para guardar en historial
async function guardarEnHistorial(tipoOperacion, expresionOriginal, expresionProcesada, resultado, estado, mensajeError = null, tiempoEjecucion = 0) {
    try {
        await sequelize.query(
            `INSERT INTO historial_operaciones 
             (usuario_id, tipo_operacion, expresion_original, expresion_procesada, 
              resultado, estado, mensaje_error, tiempo_ejecucion_ms)
             VALUES (:usuarioId, :tipoOperacion, :expresionOriginal, :expresionProcesada, 
                     :resultado, :estado, :mensajeError, :tiempoEjecucion)`,
            {
                replacements: {
                    usuarioId: usuarioActual.id,
                    tipoOperacion: tipoOperacion,
                    expresionOriginal: expresionOriginal,
                    expresionProcesada: expresionProcesada,
                    resultado: resultado,
                    estado: estado,
                    mensajeError: mensajeError,
                    tiempoEjecucion: tiempoEjecucion
                }
            }
        );
    } catch (error) {
        console.error('Error guardando en historial:', error.message);
    }
}

// Funciones del menú
async function mostrarMenuPrincipal() {
    while (true) {
        console.log('\n=== CALCULADORA ===');
        console.log('1. Crear usuario');
        console.log('2. Iniciar sesión');
        console.log('3. Salir');
        
        const opcion = prompt('Selecciona una opción (1-3): ');
        
        switch (opcion) {
            case '1':
                await crearUsuario();
                break;
            case '2':
                const loginExitoso = await iniciarSesion();
                if (loginExitoso) {
                    await mostrarMenuUsuario();
                }
                break;
            case '3':
                console.log('¡Hasta luego!');
                return;
            default:
                console.log('Opción inválida');
        }
    }
}

async function mostrarMenuUsuario() {
    while (true) {
        console.log(`\n=== MENÚ USUARIO: ${usuarioActual.nombre} ===`);
        console.log('1. Operación matemática');
        console.log('2. Operación booleana');
        console.log('3. Ver mi historial');
        if (usuarioActual.rol_id === 3) { // Si es administrador
            console.log('4. Ver historial de todos');
            console.log('5. Gestionar usuarios');
        }
        console.log('0. Cerrar sesión');
        
        const opcion = prompt('Selecciona una opción: ');
        
        switch (opcion) {
            case '1':
                await realizarOperacionMatematica();
                break;
            case '2':
                await realizarOperacionBooleana();
                break;
            case '3':
                await verHistorialPropio();
                break;
            case '4':
                if (usuarioActual.rol_id === 3) {
                    await verHistorialTodos();
                } else {
                    console.log('Opción inválida');
                }
                break;
            case '5':
                if (usuarioActual.rol_id === 3) {
                    await gestionarUsuarios();
                } else {
                    console.log('Opción inválida');
                }
                break;
            case '0':
                usuarioActual = null;
                console.log('Sesión cerrada');
                return;
            default:
                console.log('Opción inválida');
        }
    }
}

async function realizarOperacionMatematica() {
    // Verificar permisos
    const tienePermiso = await verificarPermiso('calcular_matematicas');
    if (!tienePermiso) {
        console.log('❌ No tienes permisos para realizar operaciones matemáticas');
        return;
    }

    // Verificar límites
    const limite = await verificarLimiteOperaciones();
    if (!limite.puede) {
        console.log(`❌ Has alcanzado tu límite diario de operaciones (${limite.realizadas}/${limite.limite})`);
        return;
    }

    const expresion = prompt("Escribe la operación (ej: '3 SUMA 4 MULTIPLICA 2'): ");
    const tiempoInicio = Date.now();
    
    try {
        const resultado = procesarExpresionMatematica(expresion);
        const tiempoEjecucion = Date.now() - tiempoInicio;
        
        console.log(`✅ Resultado: ${resultado}`);
        
        await incrementarContadorOperaciones();
        await guardarEnHistorial('matematica', expresion, expresion, resultado.toString(), 'exitosa', null, tiempoEjecucion);
        
        // Mostrar operaciones restantes
        const nuevoLimite = await verificarLimiteOperaciones();
        console.log(`Operaciones restantes hoy: ${nuevoLimite.limite - nuevoLimite.realizadas}`);
        
    } catch (error) {
        const tiempoEjecucion = Date.now() - tiempoInicio;
        console.log('❌ Error:', error.message);
        await guardarEnHistorial('matematica', expresion, expresion, null, 'error', error.message, tiempoEjecucion);
    }
}

async function realizarOperacionBooleana() {
    // Verificar permisos
    const tienePermiso = await verificarPermiso('calcular_booleanas');
    if (!tienePermiso) {
        console.log('❌ No tienes permisos para realizar operaciones booleanas');
        return;
    }

    // Verificar límites
    const limite = await verificarLimiteOperaciones();
    if (!limite.puede) {
        console.log(`❌ Has alcanzado tu límite diario de operaciones (${limite.realizadas}/${limite.limite})`);
        return;
    }

    const expresion = prompt("Escribe la expresión booleana (ej: 'true OR false AND true'): ");
    const tiempoInicio = Date.now();
    
    try {
        const resultado = evaluarExpresionBooleana(expresion);
        const tiempoEjecucion = Date.now() - tiempoInicio;
        const resultadoTexto = resultado ? 'true' : 'false';
        
        console.log(`✅ Resultado: ${resultadoTexto}`);
        
        await incrementarContadorOperaciones();
        await guardarEnHistorial('booleana', expresion, expresion, resultadoTexto, 'exitosa', null, tiempoEjecucion);
        
        // Mostrar operaciones restantes
        const nuevoLimite = await verificarLimiteOperaciones();
        console.log(`Operaciones restantes hoy: ${nuevoLimite.limite - nuevoLimite.realizadas}`);
        
    } catch (error) {
        const tiempoEjecucion = Date.now() - tiempoInicio;
        console.log('❌ Error:', error.message);
        await guardarEnHistorial('booleana', expresion, expresion, null, 'error', error.message, tiempoEjecucion);
    }
}

async function verHistorialPropio() {
    try {
        const [historial] = await sequelize.query(
            `SELECT tipo_operacion, expresion_original, resultado, estado, fecha_operacion
             FROM historial_operaciones 
             WHERE usuario_id = :usuarioId 
             ORDER BY fecha_operacion DESC 
             LIMIT 10`,
            {
                replacements: { usuarioId: usuarioActual.id }
            }
        );

        if (historial.length === 0) {
            console.log('No tienes operaciones en tu historial');
            return;
        }

        console.log('\n=== TU HISTORIAL (últimas 10 operaciones) ===');
        historial.forEach((op, index) => {
            console.log(`${index + 1}. [${op.tipo_operacion}] ${op.expresion_original} = ${op.resultado || 'ERROR'} (${op.estado}) - ${op.fecha_operacion}`);
        });

    } catch (error) {
        console.log('Error obteniendo historial:', error.message);
    }
}

async function verHistorialTodos() {
    try {
        const [historial] = await sequelize.query(
            `SELECT h.tipo_operacion, h.expresion_original, h.resultado, h.estado, 
                    h.fecha_operacion, u.nombre as usuario_nombre
             FROM historial_operaciones h
             JOIN usuarios u ON h.usuario_id = u.id
             ORDER BY h.fecha_operacion DESC 
             LIMIT 20`,
            {}
        );

        if (historial.length === 0) {
            console.log('No hay operaciones en el historial');
            return;
        }

        console.log('\n=== HISTORIAL GENERAL (últimas 20 operaciones) ===');
        historial.forEach((op, index) => {
            console.log(`${index + 1}. [${op.usuario_nombre}] [${op.tipo_operacion}] ${op.expresion_original} = ${op.resultado || 'ERROR'} (${op.estado}) - ${op.fecha_operacion}`);
        });

    } catch (error) {
        console.log('Error obteniendo historial general:', error.message);
    }
}

async function gestionarUsuarios() {
    console.log('\n=== GESTIÓN DE USUARIOS ===');
    console.log('1. Listar usuarios');
    console.log('2. Activar/Desactivar usuario');
    console.log('3. Cambiar rol de usuario');
    console.log('0. Volver');
    
    const opcion = prompt('Selecciona una opción: ');
    
    switch (opcion) {
        case '1':
            await listarUsuarios();
            break;
        case '2':
            await toggleUsuarioActivo();
            break;
        case '3':
            await cambiarRolUsuario();
            break;
        case '0':
            return;
        default:
            console.log('Opción inválida');
    }
}

async function listarUsuarios() {
    try {
        const [usuarios] = await sequelize.query(
            `SELECT u.id, u.dpi, u.nombre, u.email, r.nombre as rol, u.activo
             FROM usuarios u
             JOIN roles r ON u.rol_id = r.id
             ORDER BY u.nombre`
        );

        console.log('\n=== USUARIOS REGISTRADOS ===');
        usuarios.forEach((user, index) => {
            const estado = user.activo ? '✅ Activo' : '❌ Inactivo';
            console.log(`${index + 1}. ${user.nombre} (${user.dpi}) - ${user.email} - ${user.rol} - ${estado}`);
        });

    } catch (error) {
        console.log('Error listando usuarios:', error.message);
    }
}

async function toggleUsuarioActivo() {
    const dpi = prompt('Introduce el DPI del usuario: ');
    
    try {
        const [resultado] = await sequelize.query(
            `UPDATE usuarios 
             SET activo = NOT activo,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE dpi = :dpi
             RETURNING nombre, activo`,
            {
                replacements: { dpi }
            }
        );

        if (resultado.length > 0) {
            const estado = resultado[0].activo ? 'activado' : 'desactivado';
            console.log(`✅ Usuario ${resultado[0].nombre} ${estado} exitosamente`);
        } else {
            console.log('❌ Usuario no encontrado');
        }

    } catch (error) {
        console.log('Error modificando usuario:', error.message);
    }
}

async function cambiarRolUsuario() {
    const dpi = prompt('Introduce el DPI del usuario: ');
    
    console.log('\nRoles disponibles:');
    console.log('1. Usuario Básico');
    console.log('2. Usuario Premium');
    console.log('3. Administrador');
    
    const rolOpcion = prompt('Selecciona el nuevo rol (1-3): ');
    let rolId;
    
    switch(rolOpcion) {
        case '1': rolId = 1; break;
        case '2': rolId = 2; break;
        case '3': rolId = 3; break;
        default:
            console.log('Opción inválida');
            return;
    }

    try {
        const [resultado] = await sequelize.query(
            `UPDATE usuarios 
             SET rol_id = :rolId,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE dpi = :dpi
             RETURNING nombre`,
            {
                replacements: { dpi, rolId }
            }
        );

        if (resultado.length > 0) {
            console.log(`✅ Rol actualizado para ${resultado[0].nombre}`);
        } else {
            console.log('❌ Usuario no encontrado');
        }

    } catch (error) {
        console.log('Error actualizando rol:', error.message);
    }
}

// Función principal
async function main() {
    console.log('=== CALCULADORA CON SISTEMA DE PERMISOS ===');
    
    // Inicializar base de datos
    const conectado = await inicializarBaseDatos();
    if (!conectado) {
        console.log('❌ No se pudo conectar a la base de datos');
        return;
    }

    // Validar DPI
    await validarDPI();
    
    // Mostrar menú principal
    await mostrarMenuPrincipal();
}

// Manejo de errores globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar aplicación
main().catch(error => {
    console.error('Error en la aplicación:', error);
    process.exit(1);
});