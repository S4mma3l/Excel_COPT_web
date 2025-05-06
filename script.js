// --- script.js ---

// Referencias a elementos del DOM
const inputArchivosProcesar = document.getElementById('inputArchivosProcesar');
const btnProcesar = document.getElementById('btnProcesar');
const logPaso1 = document.getElementById('logPaso1');
const btnDescargarFusion = document.getElementById('btnDescargarFusion');

const inputFusion = document.getElementById('inputFusion');
const inputDestino = document.getElementById('inputDestino');
const btnInsertar = document.getElementById('btnInsertar');
const logPaso2 = document.getElementById('logPaso2');
const btnDescargarDestinoModificado = document.getElementById('btnDescargarDestinoModificado');

let workbookFusionGlobal = null;
let destinoModificadoWorkbookGlobal = null;
let nombreArchivoDestinoOriginal = ""; // Para usar en la descarga

// --- UTILIDADES ---
function addLog(areaElement, message, type = 'info') { // 'info', 'success', 'error', 'warning'
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const logEntry = document.createElement('div');
    // AÑADIR LA CLASE DEL TIPO AL DIV
    logEntry.className = `log-entry log-${type.toLowerCase()}`; 
    logEntry.textContent = `[${timeString}] ${message}`;
    
    areaElement.appendChild(logEntry);
    areaElement.scrollTop = areaElement.scrollHeight;
}

function disableButtons(buttons, disabled = true) {
    buttons.forEach(btn => {
        if (btn) btn.disabled = disabled;
    });
}

function resetPaso1UI() {
    inputArchivosProcesar.value = ""; // Limpiar input file
    // logPaso1.innerHTML = ''; // No limpiar el log aquí, se limpia al inicio de la operación
    // addLog(logPaso1, "Listo para procesar archivos."); // Se añade al inicio
    btnDescargarFusion.style.display = 'none';
    workbookFusionGlobal = null;
}

function resetPaso2UI() {
    inputFusion.value = "";
    inputDestino.value = "";
    // logPaso2.innerHTML = ''; // No limpiar el log aquí, se limpia al inicio de la operación
    // addLog(logPaso2, "Listo para insertar datos en archivo destino."); // Se añade al inicio
    btnDescargarDestinoModificado.style.display = 'none';
    destinoModificadoWorkbookGlobal = null;
    nombreArchivoDestinoOriginal = "";
}


// --- LÓGICA PASO 1: PROCESAR Y GENERAR FUSION ---
btnProcesar.addEventListener('click', async () => {
    if (inputArchivosProcesar.files.length === 0) {
        addLog(logPaso1, "Error: No se seleccionaron archivos para procesar.", "error");
        return;
    }

    disableButtons([btnProcesar, btnDescargarFusion], true);
    logPaso1.innerHTML = ''; // Limpiar log anterior al INICIO de la operación
    addLog(logPaso1, "--- Iniciando Paso 1: Procesamiento de archivos ---");
    btnDescargarFusion.style.display = 'none';
    workbookFusionGlobal = null;

    const archivos = Array.from(inputArchivosProcesar.files);
    let datosConsolidados = [];
    const columnasInteres = ['QTY', 'DESCRIPTION', 'Largo', 'Ancho', 'Espesor'];

    for (const file of archivos) {
        addLog(logPaso1, `Procesando archivo: ${file.name}`);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: true });

            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
                for (let R = range.s.r; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cell_address = { c: C, r: R };
                        const cell_ref = XLSX.utils.encode_cell(cell_address);
                        if (worksheet[cell_ref] && typeof worksheet[cell_ref].v === 'string') {
                            let originalValue = worksheet[cell_ref].v;
                            let newValue = originalValue.replace(/mm/gi, '').trim();
                            if (originalValue !== newValue) {
                                worksheet[cell_ref].v = newValue;
                                worksheet[cell_ref].w = newValue;
                            }
                        }
                    }
                }
            });
            addLog(logPaso1, `  'mm' procesado en '${file.name}'.`);

            const primeraHojaNombre = workbook.SheetNames[0];
            if (primeraHojaNombre) {
                const hojaParaConsolidar = workbook.Sheets[primeraHojaNombre];
                const jsonData = XLSX.utils.sheet_to_json(hojaParaConsolidar, { header: 1, defval: null });

                if (jsonData.length > 0 && jsonData[0] !== null) { 
                    const headers = jsonData[0].map(h => (h ? String(h).trim() : ''));
                    const indicesColumnasInteres = {};
                    columnasInteres.forEach(col => {
                        const index = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
                        if (index !== -1) indicesColumnasInteres[col] = index;
                    });

                    for (let i = 1; i < jsonData.length; i++) {
                        const filaArray = jsonData[i];
                        if (!filaArray || filaArray.every(cell => cell === null)) continue;

                        const filaObjeto = { Archivo: file.name.replace(/\.xlsx$/i, '') };
                        let tieneDatosRelevantes = false;
                        columnasInteres.forEach(col => {
                            const valorCelda = (indicesColumnasInteres[col] !== undefined) ? filaArray[indicesColumnasInteres[col]] : null;
                            filaObjeto[col] = valorCelda;
                            if (valorCelda !== null) {
                                tieneDatosRelevantes = true;
                            }
                        });

                        if (tieneDatosRelevantes || filaArray.some(cell => cell !== null)) {
                             datosConsolidados.push(filaObjeto);
                        }
                    }
                    addLog(logPaso1, `  Datos de '${file.name}' preparados para consolidación.`);
                } else {
                    addLog(logPaso1, `  Hoja '${primeraHojaNombre}' en '${file.name}' no contiene datos o cabeceras.`);
                }
            } else {
                addLog(logPaso1, `  Archivo '${file.name}' no contiene hojas.`);
            }
        } catch (error) {
            addLog(logPaso1, `Error procesando ${file.name}: ${error.message}`, "error");
            console.error(`Error en ${file.name}:`, error);
        }
    }

    if (datosConsolidados.length > 0) {
        const mapaEspesores = {
            16: 'MELAMINA 16 MM', 19: 'EUCALIPTO 18 MM', 20: 'MADERA MELINA',
            18: 'MELAMINA 18 MM', 22: 'MADERA MELINA', 10: 'MADERA MELINA',
            25: 'BUTCHERBLOCK', 3: 'MADERA MELINA', 2: 'MADERA MELINA', 42: 'BUTCHERBLOCK', 50: 'BUTCHERBLOCK', 5: 'MADERA MELINA'
        };
        datosConsolidados.forEach(fila => {
            let espesorNum = null;
            if (fila.Espesor !== null && fila.Espesor !== undefined) {
                const parsed = parseFloat(String(fila.Espesor).replace(',', '.'));
                if (!isNaN(parsed)) espesorNum = parsed;
            }
            fila.Material = mapaEspesores[espesorNum] || 'Material no definido';
        });
        addLog(logPaso1, "Materiales asignados a los datos consolidados.");

        const wsFusion = XLSX.utils.json_to_sheet(datosConsolidados, { header: ['Archivo', ...columnasInteres, 'Material'] });
        workbookFusionGlobal = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbookFusionGlobal, wsFusion, "Fusion");
        addLog(logPaso1, "Archivo 'Fusion.xlsx' generado en memoria.", "success");
        btnDescargarFusion.style.display = 'inline-block';
        disableButtons([btnDescargarFusion], false);
    } else {
        addLog(logPaso1, "No se consolidaron datos para generar 'Fusion.xlsx'.", "warning");
    }

    addLog(logPaso1, "--- Paso 1 completado. ---", "success");
    disableButtons([btnProcesar], false);
});

btnDescargarFusion.addEventListener('click', () => {
    if (workbookFusionGlobal) {
        try {
            XLSX.writeFile(workbookFusionGlobal, "Fusion.xlsx");
            addLog(logPaso1, "'Fusion.xlsx' ofrecido para descarga.", "success");
        } catch (error) {
            addLog(logPaso1, `Error al generar descarga de Fusion.xlsx: ${error.message}`, "error");
            console.error(error);
        }
    } else {
        addLog(logPaso1, "No hay archivo 'Fusion.xlsx' generado para descargar.", "warning");
    }
});

btnInsertar.addEventListener('click', async () => {
    if (!inputFusion.files[0]) {
        addLog(logPaso2, "Error: No se seleccionó el archivo Fusion.xlsx.", "error");
        return;
    }
    if (!inputDestino.files[0]) {
        addLog(logPaso2, "Error: No se seleccionó el archivo Excel Destino.", "error");
        return;
    }

    disableButtons([btnInsertar, btnDescargarDestinoModificado], true);
    logPaso2.innerHTML = ''; // Limpiar log anterior al INICIO de la operación
    addLog(logPaso2, "--- Iniciando Paso 2: Inserción en archivo destino ---");
    btnDescargarDestinoModificado.style.display = 'none';
    destinoModificadoWorkbookGlobal = null;
    nombreArchivoDestinoOriginal = "";

    try {
        const fusionFile = inputFusion.files[0];
        let dataFusion = await fusionFile.arrayBuffer();
        let wbFusion = XLSX.read(dataFusion, { type: 'array' });
        const sheetFusionName = wbFusion.SheetNames[0];
        const wsFusion = wbFusion.Sheets[sheetFusionName];
        const sourceData = XLSX.utils.sheet_to_json(wsFusion);
        addLog(logPaso2, `Datos leídos de '${fusionFile.name}'.`);

        const destinoFile = inputDestino.files[0];
        nombreArchivoDestinoOriginal = destinoFile.name;
        let dataDestino = await destinoFile.arrayBuffer();
        let wbDestino = XLSX.read(dataDestino, { type: 'array', cellStyles: true, bookVBA: true });
        addLog(logPaso2, `Archivo destino '${destinoFile.name}' cargado en memoria.`);

        const hojaDestinoNombreBuscada = 'LISTA';
        let hojaDestinoRealNombre = null;
        let wsDestino = null;

        for (const name of wbDestino.SheetNames) {
            if (name.toUpperCase() === hojaDestinoNombreBuscada.toUpperCase()) {
                hojaDestinoRealNombre = name;
                wsDestino = wbDestino.Sheets[name];
                break;
            }
        }

        if (!wsDestino) {
            addLog(logPaso2, `Error: La hoja '${hojaDestinoNombreBuscada}' no se encuentra en '${destinoFile.name}'.`, "error");
            disableButtons([btnInsertar], false);
            return;
        }
        addLog(logPaso2, `Hoja '${hojaDestinoRealNombre}' encontrada en el archivo destino.`);

        const startRowExcel = 13; 
        const startRowJS = startRowExcel - 1; 

        const existingRange = XLSX.utils.decode_range(wsDestino['!ref'] || 'A1');
        const requiredRows = (startRowJS + sourceData.length); 
        if (existingRange.e.r < requiredRows -1) { 
            existingRange.e.r = requiredRows -1;
            wsDestino['!ref'] = XLSX.utils.encode_range(existingRange);
        }

        const codigoMap = {'MELAMINA 18 MM': 2, 'MELAMINA 16 MM': 2, 'EUCALIPTO 18 MM': 2, 'MADERA MELINA': 1, 'BUTCHERBLOCK': 1};
        
        const fillYellow = { fgColor: { argb: "FFFFFF00" } }; 
        const fillBlue = { fgColor: { argb: "FF40A2E3" } };

        sourceData.forEach((rowData, index) => {
            const currentRowJS = startRowJS + index;
            const material = rowData.Material || '';
            const codigo = codigoMap[material] || '';

            const dataToInsert = [
                rowData.QTY !== undefined && rowData.QTY !== null ? rowData.QTY : "",
                rowData.DESCRIPTION || "",
                rowData.Largo !== undefined && rowData.Largo !== null ? rowData.Largo : "",
                rowData.Ancho !== undefined && rowData.Ancho !== null ? rowData.Ancho : "",
                rowData.Espesor !== undefined && rowData.Espesor !== null ? rowData.Espesor : "",
                codigo,
                material,
                rowData.Archivo || ""
            ];
            
            for (let c = 0; c < dataToInsert.length; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: currentRowJS, c: c });
                const value = dataToInsert[c];
                
                if (wsDestino[cellRef] && wsDestino[cellRef].f) {
                    addLog(logPaso2, `Advertencia: Sobrescribiendo posible fórmula en ${cellRef} con valor '${value}'.`, "warning");
                    delete wsDestino[cellRef].f;
                }
                
                // Usar cell_set_value o asignar directamente al objeto celda
                // XLSX.utils.cell_set_value(wsDestino, cellRef, value, (c === 5 && typeof value === 'number') ? 'n' : undefined);
                // O más directo:
                if (!wsDestino[cellRef]) wsDestino[cellRef] = {}; // Asegurar que la celda exista
                wsDestino[cellRef].v = value;
                if (c === 5 && typeof value === 'number') { // Columna F (codigo)
                    wsDestino[cellRef].t = 'n';
                } else {
                    // Para otros, SheetJS suele inferir 's' para string, 'n' para número. 
                    // Podrías ser más explícito si es necesario.
                    delete wsDestino[cellRef].t; // Dejar que SheetJS infiera o use el tipo existente si no es la celda F
                }


                if (c === 5) { // Columna F (código)
                    if (!wsDestino[cellRef].s) wsDestino[cellRef].s = {};

                    if (codigo === 1) {
                        wsDestino[cellRef].s.fill = fillYellow;
                    } else if (codigo === 2) {
                        wsDestino[cellRef].s.fill = fillBlue;
                    } else {
                         if (wsDestino[cellRef].s && wsDestino[cellRef].s.fill) {
                            delete wsDestino[cellRef].s.fill;
                         }
                    }
                    if (wsDestino[cellRef].s && Object.keys(wsDestino[cellRef].s).length === 0) {
                        delete wsDestino[cellRef].s;
                    }
                }
            }

            if ((index + 1) % 50 === 0) addLog(logPaso2, `  Insertadas ${index + 1} filas...`);
        });

        addLog(logPaso2, `Inserción completada. Total de ${sourceData.length} filas procesadas.`, "success");
        
        destinoModificadoWorkbookGlobal = wbDestino;
        btnDescargarDestinoModificado.innerText = `Descargar ${nombreArchivoDestinoOriginal} (Modificado)`;
        btnDescargarDestinoModificado.style.display = 'inline-block';
        // No deshabilitar el botón de descarga aquí, el usuario puede querer clickearlo

        // Limpiar UI de inputs después de la operación exitosa del Paso 2
        // Los logs permanecen para que el usuario vea el resultado
        inputFusion.value = "";
        inputDestino.value = "";
        // Opcional: resetear también el paso 1
        // resetPaso1UI();

    } catch (error) {
        addLog(logPaso2, `Error en el Paso 2: ${error.message}`, "error");
        console.error("Error detallado Paso 2:", error);
    } finally {
        disableButtons([btnInsertar], false); // Siempre rehabilitar el botón de insertar
        // Habilitar el botón de descarga si está visible
        if (btnDescargarDestinoModificado.style.display === 'inline-block') {
            disableButtons([btnDescargarDestinoModificado], false);
        }
    }
});

btnDescargarDestinoModificado.addEventListener('click', () => {
    if (destinoModificadoWorkbookGlobal && nombreArchivoDestinoOriginal) {
        try {
            XLSX.writeFile(destinoModificadoWorkbookGlobal, `MODIFICADO_${nombreArchivoDestinoOriginal}`);
            addLog(logPaso2, `Archivo destino modificado ('MODIFICADO_${nombreArchivoDestinoOriginal}') ofrecido para descarga.`, "success");
        } catch (error) {
            addLog(logPaso2, `Error al generar descarga del archivo modificado: ${error.message}`, "error");
            console.error(error);
        }
    } else {
        addLog(logPaso2, "No hay archivo destino modificado para descargar o falta el nombre original.", "warning");
    }
});

// Inicializar UI: Limpiar logs al cargar la página y poner mensajes iniciales
logPaso1.innerHTML = '';
addLog(logPaso1, "Listo para procesar archivos.");
logPaso2.innerHTML = '';
addLog(logPaso2, "Listo para insertar datos en archivo destino.");
// Asegurar que los botones de descarga estén ocultos inicialmente
btnDescargarFusion.style.display = 'none';
btnDescargarDestinoModificado.style.display = 'none';