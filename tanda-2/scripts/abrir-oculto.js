// Abre Orbis (la app visual de Cerebro) sin ninguna ventana de terminal: corre el servidor con la consola oculta
// y espera a que termine (se apaga solo 3 minutos despues de cerrar la ultima pestana). Si algo sale mal, lo
// dice en un mensaje. Lo usan el acceso directo del escritorio y "Abrir Orbis.cmd".
// Es JScript de Windows Script Host (wscript.exe), no Node: sin sintaxis moderna, sin comas finales y sin
// caracteres fuera de ASCII en el archivo (wscript lo lee en la pagina de codigos del sistema): tildes con \u.
var shell = WScript.CreateObject('WScript.Shell');
var fso = WScript.CreateObject('Scripting.FileSystemObject');
var root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName));
var HIDDEN = 0;
var ICON_ERROR = 16;
var ICON_INFO = 64;
shell.CurrentDirectory = root;

function notify(text, icon, seconds) {
  return shell.Popup(text, seconds || 0, 'Orbis', icon);
}

function run(command) {
  return shell.Run('%ComSpec% /c ' + command, HIDDEN, true);
}

if (run('where node') !== 0) {
  notify(
    'Orbis necesita Node.js 24 LTS.\n\nInstálalo desde el portal de software de la empresa y vuelve a abrir Orbis.',
    ICON_ERROR
  );
  WScript.Quit(1);
}

if (!fso.FileExists(root + '\\node_modules\\.package-lock.json')) {
  notify('Primera vez: instalando lo que Orbis necesita. Tarda unos minutos y se abre sola al terminar.', ICON_INFO, 8);
  if (run('npm install') !== 0) {
    notify('No se pudieron instalar las dependencias. Corre "npm install" en la carpeta de Orbis.', ICON_ERROR);
    WScript.Quit(1);
  }
}

if (!fso.FileExists(root + '\\dist\\app\\index.html')) {
  if (run('npm run build:app') !== 0) {
    notify('No se pudo compilar la app. Corre "npm run app" en la carpeta de Orbis para ver el error.', ICON_ERROR);
    WScript.Quit(1);
  }
}

// la variable va en la misma linea de cmd: asi solo la ve este servidor
var code = run('set CEREBRO_APAGAR_SIN_PESTANAS_MS=180000&& node servidor\\servidor.ts --abrir');
if (code !== 0) {
  notify(
    'Orbis no pudo abrir (código ' + code + ').\n\nLo más común: el puerto 4810 lo usa otra aplicación. ' +
      'Para ver el detalle, corre "npm run app:abrir" en la carpeta de Orbis.',
    ICON_ERROR
  );
  WScript.Quit(1);
}
