TRAIL POR UNA SONRISA 2026 — PAQUETE DE DESARROLLO
==================================================

CONTENIDO
---------
index.html                 Landing page pública y formulario.
styles.css                 Diseño responsive, basado en la muestra de Parchados.
config.js                  URL y clave pública de Supabase (debes configurarlas).
app.js                     Formulario, comprobante privado, confirmación y contadores.
admin.html                 Panel administrativo privado.
admin.css                  Estilos del panel.
admin.js                   Autenticación, pagos, participantes, finanzas, juguetes,
                           comunidades, FAQ, galería y exportación CSV.
supabase/schema.sql        Base de datos, políticas de seguridad, storage y funciones RPC.

ARQUITECTURA
------------
Frontend estático (se puede publicar en GitHub Pages, Netlify o hosting similar)
+ Supabase (PostgreSQL, autenticación y almacenamiento privado).

IMPORTANTE: no es una aplicación que funcione al abrir el HTML directamente.
Primero se debe configurar Supabase y completar config.js.

PASO 1 — CREAR EL PROYECTO SUPABASE
-----------------------------------
1. Crear un proyecto en https://supabase.com/.
2. Abrir SQL Editor.
3. Ejecutar completo el archivo supabase/schema.sql.
4. Revisar que se hayan creado las tablas, funciones y bucket payment-receipts.
5. En Authentication > Users, crear el usuario que será administrador.
6. Copiar el UUID de ese usuario.
7. Ejecutar en SQL Editor (reemplaza el UUID):
   insert into public.admin_users(user_id)
   values ('UUID-DEL-USUARIO-ADMIN');
8. En Project Settings > API, copiar Project URL y anon/public key.
9. Editar config.js:
   SUPABASE_URL: "https://TU-PROYECTO.supabase.co"
   SUPABASE_ANON_KEY: "TU_ANON_PUBLIC_KEY"
   Nunca usar service_role en el navegador.

PASO 2 — CONFIGURAR Y PUBLICAR
------------------------------
1. Mantener todos los archivos en la misma carpeta y la carpeta supabase.
2. Completar config.js.
3. Probar localmente con un servidor estático (por ejemplo, Live Server).
4. Publicar la carpeta en GitHub Pages, Netlify o hosting propio.
5. La página pública será index.html.
6. El panel de administración será admin.html. No se enlaza en la navegación pública;
   la protección real la realizan Supabase Auth, la tabla admin_users y RLS.

PASO 3 — OPERACIÓN DEL ADMINISTRADOR
------------------------------------
- Ingresar en admin.html con el usuario creado en Supabase.
- Confirmar o rechazar pagos desde Participantes.
- Ver comprobantes con URL firmada de duración limitada.
- Registrar ingresos/egresos desde Finanzas.
- Registrar juguetes; solo los verificados alimentan el contador público.
- Crear comunidades y desactivarlas.
- Agregar preguntas frecuentes.
- Agregar fotos/GIF mediante URL pública de un servicio de almacenamiento de medios.
- Exportar la tabla de participantes en CSV compatible con Excel.

COMPORTAMIENTO DEL CONTEO
-------------------------
- Abrir o empezar a llenar el formulario NO incrementa ningún contador.
- El comprobante es obligatorio; se valida tipo y máximo 5 MB.
- El navegador sube el comprobante al bucket privado.
- Después llama submit_registration, que inserta el registro en una transacción.
- Solo si el servidor devuelve un código TPS26-XXXXXXXX se muestra confirmación.
- Si falla la inserción, el frontend intenta borrar el archivo que acababa de subir.
- request_token es único para impedir duplicados por reintentos de la misma petición.
- El documento tiene índice único para impedir una segunda inscripción con el mismo documento.
- Inscripciones recibidas y pagos confirmados son contadores diferentes.
- El contador de confirmados solo cuenta payment_status = 'Pago confirmado'.

SEGURIDAD Y DATOS
-----------------
- Los comprobantes están en un bucket privado, no en una URL pública.
- La tabla de inscripciones no permite lectura pública directa.
- La función pública de estadísticas devuelve agregados, nunca datos personales.
- Las acciones administrativas requieren autenticación y registro en admin_users.
- No compartas la anon key como si fuera secreta: está diseñada para frontend y se limita
  mediante RLS. Nunca publiques service_role.
- Configura políticas de contraseña, MFA si está disponible, copias de seguridad y
  restricciones de acceso en el proyecto Supabase.
- El consentimiento de uso de imagen es opcional e independiente.
- Términos, tratamiento de datos y exoneración deben revisarse legalmente antes de abrir
  inscripciones. El texto de exoneración es una base operativa, no asesoría jurídica.

LIMITACIONES / TAREAS DE PUESTA EN PRODUCCIÓN
---------------------------------------------
1. Revisar con el desarrollador las políticas RLS en el proyecto real y probar desde
   una sesión anónima y desde una cuenta que no sea administradora.
2. Configurar correo de confirmación/recuperación de contraseña en Supabase Auth.
3. Configurar el dominio, HTTPS, políticas de privacidad y contacto del responsable
   de datos personales.
4. Añadir un canal de notificación al administrador (correo/WhatsApp) si se requiere.
5. Para la galería, cargar medios a un bucket público separado y pegar las URL en el panel.
6. La sección financiera registra movimientos manuales. Evita duplicar ingresos:
   los pagos confirmados se suman automáticamente desde inscripciones. En Finanzas
   registra donaciones externas y otros movimientos, no vuelvas a registrar allí
   cada pago de inscripción.
7. El conteo de dinero recaudado suma pagos confirmados y movimientos de ingreso
   manuales; por eso la regla anterior es importante.
8. La tabla de inscripciones tiene unicidad de documento para este evento. Si se requiere
   permitir varias inscripciones con el mismo documento (por ejemplo, otro evento),
   debe añadirse un event_id y cambiar el índice único.
9. La plataforma no integra pasarela de pago; recibe comprobantes para revisión manual.
10. El precio está fijado en $25.000 COP en el frontend y validado en el servidor SQL.
    Si cambia, actualizar ambos lugares.

PRUEBAS OBLIGATORIAS ANTES DE PUBLICAR
--------------------------------------
[ ] Enviar formulario sin comprobante: debe bloquearse.
[ ] Enviar con formato no permitido: debe bloquearse.
[ ] Enviar archivo de más de 5 MB: debe bloquearse.
[ ] Enviar sin cada una de las tres aceptaciones obligatorias: debe bloquearse.
[ ] Enviar correctamente: debe devolver código TPS26-XXXXXXXX.
[ ] Intentar enviar el mismo documento otra vez: debe bloquearse.
[ ] Revisar que el comprobante no sea accesible públicamente.
[ ] Revisar que un usuario no administrador no pueda entrar al panel ni consultar datos.
[ ] Confirmar pago y comprobar que aumenta el contador de confirmados.
[ ] Rechazar pago y comprobar que deja de contar como confirmado.
[ ] Registrar juguetes no verificados y verificados; solo estos últimos deben contar.
[ ] Probar exportación CSV.
[ ] Probar en celular, tablet y computador.

NOTAS SOBRE LA REFERENCIA
-------------------------
Se conserva la idea de formulario centrado, tipografía Inter, naranja #FF914D,
degradado naranja, tarjetas blancas, campos redondeados y diseño móvil sencillo.
La nueva landing amplía esa base con secciones públicas y un panel administrativo.
