<template>
  <div class="tracker-container">
    <header class="header">
      <h1>Adrenalyn XL</h1>
      <div class="drive-buttons">
        <button @click="triggerFileInput" class="btn-sync btn-restore">
          Restaurar Backup
        </button>
        <button @click="downloadBackup" class="btn-sync">
          Descargar Backup
        </button>
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".json" style="display: none" />
      </div>
    </header>

    <div class="stats">
      <p>Cartas Totales: {{ store.totalCards }}</p>
      <p>Repetidas: {{ store.duplicates.length }}</p>
    </div>

    <!-- ACCIONES DE EXPORTACIÓN -->
    <div class="share-actions" v-if="activeTab === 'duplicates' && store.duplicates.length > 0">
      <p class="export-title">Exportar Repetidas</p>
      <div class="buttons-row">
        <button @click="exportListXlsx('duplicates')" class="btn-action btn-excel">📊 Excel (XLSX)</button>
        <button @click="exportListPdf('duplicates')" class="btn-action btn-pdf">📕 PDF</button>
        <button @click="shareList('duplicates')" class="btn-action btn-whatsapp">📲 Compartir</button>
      </div>
    </div>

    <div class="share-actions" v-if="activeTab === 'missing' && filteredCollection.length > 0">
      <p class="export-title">Exportar Faltantes</p>
      <div class="buttons-row">
        <button @click="exportListXlsx('missing')" class="btn-action btn-excel">📊 Excel (XLSX)</button>
        <button @click="exportListPdf('missing')" class="btn-action btn-pdf">📕 PDF</button>
        <button @click="shareList('missing')" class="btn-action btn-whatsapp">📲 Compartir</button>
      </div>
    </div>

    <div class="bulk-actions" v-if="store.isAdmin">
      <h3>Carga Rápida y Configuración</h3>
      <div class="bulk-input-group">
        <input v-model="albumSizeInput" type="number" placeholder="Total de cartas del álbum (Ej: 630)" />
        <button @click="initializeAlbum" class="btn-bulk btn-init">Generar Faltantes</button>
      </div>
      <div class="bulk-input-group">
        <input v-model="bulkOwnedInput" type="text" placeholder="Las que tengo (Ej: 1, 2, 5-10)" />
        <button @click="processBulkOwned" class="btn-bulk">Agregar Obtenidas</button>
      </div>
      <div class="bulk-input-group">
        <input v-model="bulkDuplicatesInput" type="text" placeholder="Repetidas (Ej: 3, 14, 20-22)" />
        <button @click="processBulkDuplicates" class="btn-bulk btn-bulk-alt">Agregar Repetidas</button>
      </div>
    </div>

    <div class="tabs">
      <button @click="activeTab = 'all'" :class="{ active: activeTab === 'all' }" class="tab-btn">
        Todas
      </button>
      <button @click="activeTab = 'missing'" :class="{ active: activeTab === 'missing' }" class="tab-btn">
        Me Faltan
      </button>
      <button @click="activeTab = 'duplicates'" :class="{ active: activeTab === 'duplicates' }" class="tab-btn">
        Repetidas
      </button>
    </div>

    <!-- Paginador -->
    <div class="pagination" v-if="totalPages > 1">
      <button @click="prevPage" :disabled="currentPage === 1" class="btn-page">Anterior</button>
      <span>Pág {{ currentPage }} / {{ totalPages }}</span>
      <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-page">Siguiente</button>
    </div>

    <div class="card-list">
      <!-- Mensaje si la lista está vacía -->
      <div v-if="filteredCollection.length === 0" class="empty-state">
        No hay cartas en esta sección.
      </div>

      <div v-for="card in paginatedCollection" :key="card.id" :class="['card-item', `design-${card.design || 'normal'}`]">
        <div class="card-info">
          <span class="card-id">#{{ card.id }}</span>
          <input 
            v-model="card.name" 
            class="card-name-input" 
            placeholder="Sin nombre (Editar)" 
            @change="store.saveCardToDB(card)"
            :readonly="!store.isAdmin"
          />
          <select v-model="card.design" class="card-design-select" @change="store.saveCardToDB(card)" :disabled="!store.isAdmin">
            <option value="normal">Normal</option>
            <option value="epica">Épica</option>
            <option value="holografica">Holográfica</option>
          </select>
        </div>
        
        <!-- Controles para usuarios -->
        <div class="card-actions" v-if="store.isAdmin">
          <button @click="store.decrement(card.id)" :disabled="card.owned === 0" class="btn btn-minus">-</button>
          <span class="card-count" :class="{'has-duplicates': card.owned > 1}">{{ card.owned }}</span>
          <button @click="store.increment(card.id)" class="btn btn-plus">+</button>
          <button @click="deleteCard(card.id)" class="btn btn-delete">🗑️</button>
        </div>
        <div class="card-count-readonly" v-else>
          <span>Posees: <strong>{{ card.owned }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Toast Notification (Mensajes de aviso rápidos) -->
    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>

    <div class="footer-actions">
      <button v-if="!store.isAdmin" @click="showLoginModal = true" class="btn-login-trigger">🔒 Acceso Admin</button>
      <button v-else @click="handleLogout" class="btn-logout-trigger">🔓 Cerrar Sesión</button>
    </div>

    <!-- Login Modal -->
    <div v-if="showLoginModal" class="modal-overlay" @click="showLoginModal = false">
      <div class="modal-content login-modal" @click.stop>
        <h3>🔐 Acceso Administrativo</h3>
        <p>Solo el dueño del álbum puede iniciar sesión para modificar el inventario.</p>
        <form @submit.prevent="handleLogin" class="login-form">
          <input type="email" v-model="loginEmail" placeholder="Correo electrónico" required class="login-input" />
          <input type="password" v-model="loginPassword" placeholder="Contraseña" required class="login-input" />
          <div class="modal-buttons">
            <button type="button" class="btn-cancel" @click="showLoginModal = false">Cancelar</button>
            <button type="submit" class="btn-confirm" :disabled="isLoggingIn">
              {{ isLoggingIn ? 'Entrando...' : 'Iniciar Sesión' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Confirm Modal (Ventana de confirmación) -->
    <div v-if="confirmDialog.show" class="modal-overlay">
      <div class="modal-content">
        <p>{{ confirmDialog.message }}</p>
        <div class="modal-actions">
          <button @click="closeConfirm" class="modal-btn btn-cancel">Cancelar</button>
          <button @click="executeConfirm" class="modal-btn btn-confirm">Aceptar</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCardStore } from '../stores/cards'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const store = useCardStore()

// Estado de las pestañas
const activeTab = ref<'all' | 'missing' | 'duplicates'>('all')

// Computada para filtrar la colección según la pestaña activa
const filteredCollection = computed(() => {
  let result = store.collection
  if (activeTab.value === 'missing') {
    result = store.collection.filter(c => c.owned === 0)
  } else if (activeTab.value === 'duplicates') {
    result = store.collection.filter(c => c.owned > 1)
  }
  
  // Ordenar numéricamente para que siempre se vean en orden (1, 2, 3...)
  return [...result].sort((a, b) => {
    const numA = parseInt(String(a.id))
    const numB = parseInt(String(b.id))
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return String(a.id).localeCompare(String(b.id))
  })
})

// --- LÓGICA DE PAGINACIÓN ---
const currentPage = ref(1)
const itemsPerPage = ref(30)

// Al cambiar de pestaña volvemos a la primera página
watch(activeTab, () => {
  currentPage.value = 1
})

const totalPages = computed(() => Math.ceil(filteredCollection.value.length / itemsPerPage.value))

const paginatedCollection = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredCollection.value.slice(start, end)
})

const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }
const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }

// --- LÓGICA DE INTERFAZ (Toasts y Modals) ---
const toast = ref({ show: false, message: '', type: 'info' })
let toastTimeout: ReturnType<typeof setTimeout>

// Modal de Login
const showLoginModal = ref(false)
const loginEmail = ref('')
const loginPassword = ref('')
const isLoggingIn = ref(false)

const handleLogin = async () => {
  if (!loginEmail.value || !loginPassword.value) return
  isLoggingIn.value = true
  try {
    await store.login(loginEmail.value, loginPassword.value)
    showToast('Sesión iniciada correctamente', 'success')
    showLoginModal.value = false
    loginEmail.value = ''
    loginPassword.value = ''
  } catch (error) {
    showToast('Credenciales incorrectas', 'error')
  } finally {
    isLoggingIn.value = false
  }
}

const handleLogout = async () => {
  await store.logout()
  showToast('Sesión cerrada', 'info')
}

const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  toast.value = { show: true, message, type }
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.value.show = false }, 3500)
}

const confirmDialog = ref({ show: false, message: '', onConfirm: () => {} })
const showConfirm = (message: string, onConfirm: () => void) => {
  confirmDialog.value = { show: true, message, onConfirm }
}
const closeConfirm = () => { confirmDialog.value.show = false }
const executeConfirm = () => {
  confirmDialog.value.onConfirm()
  closeConfirm()
}

onMounted(async () => {
  await store.checkAuth()
  await store.loadFromDB()
  
  // Recuperar de localStorage si la base de datos de la store no cargó nada
  if (store.collection && store.collection.length > 0 && store.totalCards === 0) {
    const localData = localStorage.getItem('adrenalyn_local_backup')
    if (localData) {
      store.collection = JSON.parse(localData)
    }
  }

  // --- MIGRACIÓN: Actualizar cartas específicas si ya existen en el localData ---
  store.collection.forEach(card => {
    // Asignar normal por defecto si no tiene diseño, sin sobreescribir
    if (!card.design) {
      card.design = 'normal'
    }

    const info = getCardDefaultInfo(card.id)
    // Si el nombre sigue siendo el genérico, le ponemos el real
    if (info.name !== `Carta ${card.id}` && card.name === `Carta ${card.id}`) {
      card.name = info.name
    }
    // Forzar el diseño holográfico para la 623 en caso de que esté normal
    if (String(card.id) === '623') {
      card.design = 'holografica'
    }
  })
})

// --- SISTEMA DE BACKUP LOCAL (SIN BACKEND) ---
const downloadBackup = () => {
  const dataStr = JSON.stringify(store.collection, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `adrenalyn_backup_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// --- Funciones de Exportación (Repetidas y Faltantes) ---

const getExportData = (type: 'duplicates' | 'missing') => {
  if (type === 'duplicates') {
    return {
      list: store.duplicates,
      title: 'Repetidas',
      docTitle: 'Mis Cartas Repetidas - Adrenalyn XL',
      emptyMsg: 'No tienes cartas repetidas para exportar.',
      fileName: 'repetidas_adrenalyn',
      shareTitle: 'Mis Repetidas Adrenalyn XL',
      shareIntro: '¡Hola! Estas son mis cartas repetidas de Adrenalyn XL:\n\n'
    }
  } else {
    return {
      list: filteredCollection.value, // filteredCollection ya contiene las faltantes si la tab es 'missing'
      title: 'Faltantes',
      docTitle: 'Cartas que me faltan - Adrenalyn XL',
      emptyMsg: 'No tienes cartas faltantes en tu colección.',
      fileName: 'faltantes_adrenalyn',
      shareTitle: 'Cartas que me faltan Adrenalyn XL',
      shareIntro: '¡Hola! Estas son las cartas que me faltan de Adrenalyn XL:\n\n'
    }
  }
}

const exportListXlsx = (type: 'duplicates' | 'missing') => {
  const meta = getExportData(type)
  if (meta.list.length === 0) {
    showToast(meta.emptyMsg, 'info')
    return
  }
  
  const data = meta.list.map(c => {
    const row: any = {
      ID: `#${c.id}`,
      Nombre: c.name,
      Diseño: c.design || 'normal'
    }
    if (type === 'duplicates') {
      row['Cantidad Extra'] = c.owned > 1 ? c.owned - 1 : 0
    }
    return row
  })

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, meta.title)
  
  XLSX.writeFile(workbook, `${meta.fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  showToast(`Archivo Excel de ${meta.title} generado exitosamente.`, 'success')
}

const exportListPdf = (type: 'duplicates' | 'missing') => {
  const meta = getExportData(type)
  if (meta.list.length === 0) {
    showToast(meta.emptyMsg, 'info')
    return
  }
  
  const doc = new jsPDF()
  doc.text(meta.docTitle, 14, 15)
  
  const head = type === 'duplicates' 
    ? [['ID', 'Nombre', 'Cantidad Extra', 'Diseño']]
    : [['ID', 'Nombre', 'Diseño']]

  const tableData = meta.list.map(c => {
    const row = [`#${c.id}`, c.name]
    if (type === 'duplicates') {
      row.push(String(c.owned > 1 ? c.owned - 1 : 0))
    }
    row.push(c.design || 'normal')
    return row
  })
  
  autoTable(doc, {
    startY: 20,
    head: head,
    body: tableData,
    styles: { font: 'helvetica' },
    headStyles: { fillColor: type === 'duplicates' ? [66, 133, 244] : [234, 67, 53] }
  })
  
  doc.save(`${meta.fileName}_${new Date().toISOString().slice(0, 10)}.pdf`)
  showToast(`Archivo PDF de ${meta.title} generado exitosamente.`, 'success')
}

const shareList = async (type: 'duplicates' | 'missing') => {
  const meta = getExportData(type)
  if (meta.list.length === 0) {
    showToast(meta.emptyMsg, 'info')
    return
  }
  
  let textContent = meta.shareIntro
  meta.list.forEach(c => {
    if (type === 'duplicates') {
      const extra = c.owned > 1 ? c.owned - 1 : 0
      textContent += `▪️ #${c.id} ${c.name} (x${extra})\n`
    } else {
      textContent += `▪️ #${c.id} ${c.name}\n`
    }
  })
  textContent += type === 'duplicates' ? '\n¿Te sirve alguna para cambiar?' : '\n¿Tienes alguna para cambiar?'
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: meta.shareTitle,
        text: textContent
      })
      showToast('¡Compartido con éxito!', 'success')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
         showToast('Error al intentar compartir.', 'error')
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(textContent)
      showToast('Texto copiado al portapapeles. ¡Pégalo donde quieras!', 'success')
    } catch(err) {
      showToast('Tu navegador no soporta compartir ni copiar.', 'error')
    }
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string
      const parsedData = JSON.parse(content)
      
      showConfirm('¿Estás seguro de que quieres reemplazar tu colección con los datos de este archivo? Esta acción no se puede deshacer.', async () => {
        await store.restoreCollection(parsedData)
        showToast('Colección restaurada y sincronizada con Supabase.', 'success')
      })
    } catch (error) {
      showToast('El archivo seleccionado no tiene un formato válido.', 'error')
      console.error(error)
    }
    // Limpiamos el input para permitir volver a cargar el mismo archivo
    target.value = ''
  }
  reader.readAsText(file)
}

// Lógica para inicializar álbum
const albumSizeInput = ref('')

// Función para pre-cargar nombres y diseños especiales
const getCardDefaultInfo = (id: string | number) => {
  const idStr = String(id)
  let name = `Carta ${idStr}`
  let design = 'normal'

  switch (idStr) {
    case '296': name = 'HIRVING LOZANO'; break;
    case '521': name = 'PIERRE-EMILE'; break;
    case '523': name = 'MIKKEL DAMS'; break;
    case '541': name = 'DEJAN KULUSEVSKI'; break;
    case '623': name = 'PAU CUBARSI'; design = 'holografica'; break;
  }

  return { name, design }
}

const initializeAlbum = async () => {
  const size = Number(albumSizeInput.value)
  if (isNaN(size) || size <= 0) return alert('Por favor, ingresa un número válido.')
  if (!confirm(`¿Quieres crear las cartas del 1 al ${size} marcadas como faltantes? (No sobreescribirá las que ya tienes)`)) return

  let agregadas = 0
  for (let i = 1; i <= size; i++) {
    const idStr = String(i)
    const exists = store.collection.find(c => String(c.id).toLowerCase() === idStr.toLowerCase())
    if (!exists) {
        const info = getCardDefaultInfo(idStr)
        store.collection.push({ id: idStr, name: info.name, owned: 0, design: info.design })
      agregadas++
    }
  }
  
  if (agregadas > 0) {
    await store.saveAllToDB()
  }
  alert(`Se han generado ${agregadas} cartas nuevas en la sección "Me faltan".`)
  albumSizeInput.value = ''
}

// Lógica para carga rápida
const bulkOwnedInput = ref('')
const bulkDuplicatesInput = ref('')

const parseCardIds = (input: string): string[] => {
  const result: string[] = []
  if (!input) return result
  const parts = input.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-')
      const start = Number(startStr)
      const end = Number(endStr)
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          result.push(i.toString())
        }
      } else {
        result.push(trimmed)
      }
    } else if (trimmed) {
      result.push(trimmed)
    }
  }
  return result
}

const processBulkOwned = async () => {
  const ids = parseCardIds(bulkOwnedInput.value)
  let agregadas = 0
  let yaExistian = 0

  for (const id of ids) {
    const card = store.collection.find(c => String(c.id).toLowerCase() === String(id).toLowerCase())
    if (card) {
      if (card.owned === 0) {
        card.owned++
        agregadas++
      } else {
        yaExistian++
      }
    } else {
      // Si la carta no existe, la creamos y la agregamos a la colección
      const info = getCardDefaultInfo(id)
      store.collection.push({
        id: String(id),
        name: info.name,
        owned: 1,
        design: info.design
      })
      agregadas++
    }
  }

  if (agregadas > 0) {
    await store.saveAllToDB()
    showToast(`¡Éxito! Se marcaron ${agregadas} cartas como obtenidas.`, 'success')
  } else if (yaExistian > 0) {
    showToast(`Las cartas ingresadas ya las tenías registradas.`, 'info')
  }

  bulkOwnedInput.value = ''
}

const processBulkDuplicates = async () => {
  const ids = parseCardIds(bulkDuplicatesInput.value)
  let agregadas = 0

  for (const id of ids) {
    const card = store.collection.find(c => String(c.id).toLowerCase() === String(id).toLowerCase())
    if (card) {
      if (card.owned === 0) {
        card.owned += 2
      } else {
        card.owned++
      }
      agregadas++
    } else {
      const info = getCardDefaultInfo(id)
      store.collection.push({
        id: String(id),
        name: info.name,
        owned: 2,
        design: info.design
      })
      agregadas++
    }
  }

  if (agregadas > 0) {
    await store.saveAllToDB()
    showToast(`¡Éxito! Se añadieron ${agregadas} cartas repetidas.`, 'success')
  }

  bulkDuplicatesInput.value = ''
}

// Lógica para eliminar carta
const deleteCard = (id: string | number) => {
  showConfirm('¿Seguro que quieres eliminar esta carta de tu colección?', async () => {
    await store.deleteCard(String(id))
    showToast('Carta eliminada.', 'info')
  })
}
</script>

<style scoped>
.tracker-container {
  max-width: 600px;
  margin: 0 auto;
  font-family: sans-serif;
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #eee;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
}

.drive-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-sync {
  background-color: #4285f4;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-restore {
  background-color: #fbbc05;
  color: #333;
}

.btn-sync:disabled {
  background-color: #a0c1f9;
}

/* Estilos para Compartir y Exportar */
.share-actions {
  background: white;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}
.export-title {
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
}
.buttons-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-action {
  background-color: #607d8b;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  transition: transform 0.2s, background-color 0.2s;
}

.btn-action:hover {
  transform: translateY(-2px);
  background-color: #546e7a;
}

.btn-whatsapp {
  background-color: #25d366;
}

.btn-whatsapp:hover {
  background-color: #128c7e;
}

.btn-excel {
  background-color: #217346;
}

.btn-excel:hover {
  background-color: #1a5c38;
}

.btn-pdf {
  background-color: #d32f2f;
}

.btn-pdf:hover {
  background-color: #b71c1c;
}

/* Estilos para Carga Rápida */
.bulk-actions {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid #e0e0e0;
}

.bulk-actions h3 {
  margin-top: 0;
  margin-bottom: 0.8rem;
  font-size: 1.1rem;
}

.bulk-input-group {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.bulk-input-group input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.btn-bulk {
  background-color: #34a853;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-init {
  background-color: #9c27b0;
  color: white;
}

.btn-bulk-alt {
  background-color: #fbbc05;
  color: #333;
}

/* Estilos para Pestañas */
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tab-btn {
  flex: 1;
  padding: 0.5rem;
  background-color: #eee;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  color: #555;
}

.tab-btn.active {
  background-color: #4285f4;
  color: white;
}

.tab-btn.toast-info {
  background-color: #2196f3;
  color: white;
}

/* Login y Footer */
.footer-actions {
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #ddd;
}
.btn-login-trigger, .btn-logout-trigger {
  background: none;
  border: none;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}
.btn-login-trigger:hover, .btn-logout-trigger:hover {
  color: #333;
}
.login-modal {
  max-width: 350px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 20px;
}
.login-input {
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #777;
  font-style: italic;
}

.stats {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  font-weight: bold;
}

.card-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.card-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  transition: background 0.3s, border-color 0.3s;
  text-align: center;
}

.design-normal {
  background-color: #fff;
  border-color: #e0e0e0;
}

.design-epica {
  background: linear-gradient(135deg, #555555 0%, #1a1a1a 50%, #333333 100%);
  border-color: #888888;
  color: white;
}

.design-epica .card-id,
.design-epica .card-count {
  color: #eee;
}

.design-epica .card-name-input {
  color: white;
}

.design-epica .card-name-input::placeholder {
  color: #aaa;
}

.design-epica .card-design-select {
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
}

.design-epica .has-duplicates {
  color: #64b5f6;
}

.design-holografica {
  background: linear-gradient(135deg, #e0f7fa 0%, #fce4ec 50%, #e8eaf6 100%);
  border-color: #00bcd4;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
  align-items: center;
}

.card-id {
  font-size: 0.8rem;
  color: #666;
}

.card-name-input {
  border: 1px solid transparent;
  background: transparent;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.2rem;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
}

.card-name-input:focus {
  border-bottom: 1px solid #4285f4;
  outline: none;
  background: #fff;
}

.card-design-select {
  border-radius: 4px;
  border: 1px solid #ccc;
  padding: 0.2rem;
  font-size: 0.75rem;
  background-color: rgba(255, 255, 255, 0.6);
  color: #333;
  width: 100%;
}

.card-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  width: 100%;
  margin-top: 0.5rem;
}

.btn {
  width: 28px;
  height: 28px;
  font-size: 1.1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-minus {
  background-color: #ffebee;
  color: #c62828;
}

.btn-minus:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-plus {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.btn-delete {
  background-color: #ffcdd2;
  color: #c62828;
}

.btn-delete:hover {
  background-color: #ef9a9a;
}

.card-count {
  font-size: 1.1rem;
  font-weight: bold;
  min-width: 20px;
  text-align: center;
}

.has-duplicates {
  color: #1976d2;
}

/* --- ESTILOS DE PAGINACIÓN --- */
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  font-weight: bold;
}

.btn-page {
  background-color: #4285f4;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}

.btn-page:disabled {
  background-color: #a0c1f9;
}

/* --- ESTILOS PARA POPUPS Y MODALES --- */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  font-size: 0.95rem;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  text-align: center;
  width: 90%;
  max-width: 400px;
  animation: fadeInDown 0.3s ease-out;
}

.toast.success { background-color: #34a853; }
.toast.error { background-color: #ea4335; }
.toast.info { background-color: #4285f4; }

@keyframes fadeInDown {
  from { opacity: 0; transform: translate(-50%, -20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(0,0,0,0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.modal-content {
  background-color: white;
  padding: 1.8rem;
  border-radius: 12px;
  width: 90%;
  max-width: 350px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 1.5rem;
  gap: 1rem;
}

.modal-btn {
  padding: 0.8rem 1rem;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  flex: 1;
}

.btn-cancel { background-color: #e0e0e0; color: #333; }
.btn-confirm { background-color: #ea4335; color: white; }
</style>
