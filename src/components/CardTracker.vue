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

    <div class="bulk-actions">
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

    <div class="card-list">
      <!-- Mensaje si la lista está vacía -->
      <div v-if="filteredCollection.length === 0" class="empty-state">
        No hay cartas en esta sección.
      </div>

      <div v-for="card in filteredCollection" :key="card.id" class="card-item">
        <div class="card-info">
          <span class="card-id">#{{ card.id }}</span>
          <input 
            v-model="card.name" 
            class="card-name-input" 
            placeholder="Sin nombre (Editar)" 
          />
        </div>
        <div class="card-actions">
          <button @click="store.decrement(card.id)" :disabled="card.owned === 0" class="btn btn-minus">-</button>
          <span class="card-count" :class="{'has-duplicates': card.owned > 1}">{{ card.owned }}</span>
          <button @click="store.increment(card.id)" class="btn btn-plus">+</button>
          <button @click="deleteCard(card.id)" class="btn btn-delete">🗑️</button>
        </div>
      </div>
    </div>

    <!-- Toast Notification (Mensajes de aviso rápidos) -->
    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
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

// --- LÓGICA DE INTERFAZ (Toasts y Modals) ---
const toast = ref({ show: false, message: '', type: 'info' })
let toastTimeout: ReturnType<typeof setTimeout>

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
  await store.loadFromDB()
  
  // Recuperar de localStorage si la base de datos de la store no cargó nada
  if (store.collection && store.collection.length > 0 && store.totalCards === 0) {
    const localData = localStorage.getItem('adrenalyn_local_backup')
    if (localData) {
      store.collection = JSON.parse(localData)
    }
  }
})

// Guardar automáticamente en localStorage cada vez que haya un cambio
watch(() => store.collection, (newCollection) => {
  localStorage.setItem('adrenalyn_local_backup', JSON.stringify(newCollection))
}, { deep: true })

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
      
      showConfirm('¿Estás seguro de que quieres reemplazar tu colección con los datos de este archivo? Esta acción no se puede deshacer.', () => {
        store.collection = parsedData
        showToast('Colección restaurada exitosamente.', 'success')
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

const initializeAlbum = () => {
  const size = Number(albumSizeInput.value)
  if (isNaN(size) || size <= 0) return alert('Por favor, ingresa un número válido.')
  if (!confirm(`¿Quieres crear las cartas del 1 al ${size} marcadas como faltantes? (No sobreescribirá las que ya tienes)`)) return

  let agregadas = 0
  for (let i = 1; i <= size; i++) {
    const idStr = String(i)
    const exists = store.collection.find(c => String(c.id).toLowerCase() === idStr.toLowerCase())
    if (!exists) {
      store.collection.push({ id: idStr, name: `Carta ${idStr}`, owned: 0 })
      agregadas++
    }
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

const processBulkOwned = () => {
  const ids = parseCardIds(bulkOwnedInput.value)
  let agregadas = 0
  let yaExistian = 0

  ids.forEach(id => {
    // toLowerCase() ayuda a que coincida si por ejemplo escribes arg1 y en la bd es ARG1
    const card = store.collection.find(c => String(c.id).toLowerCase() === String(id).toLowerCase())
    if (card) {
      if (card.owned === 0) {
        store.increment(card.id)
        agregadas++
      } else {
        yaExistian++
      }
    } else {
      // Si la carta no existe, la creamos y la agregamos a la colección
      store.collection.push({
        id: String(id),
        name: `Carta ${id}`,
        owned: 1
      })
      agregadas++
    }
  })

  if (agregadas > 0) {
    showToast(`¡Éxito! Se marcaron ${agregadas} cartas como obtenidas.`, 'success')
  } else if (yaExistian > 0) {
    showToast(`Las cartas ingresadas ya las tenías registradas.`, 'info')
  }

  bulkOwnedInput.value = ''
}

const processBulkDuplicates = () => {
  const ids = parseCardIds(bulkDuplicatesInput.value)
  let agregadas = 0

  ids.forEach(id => {
    const card = store.collection.find(c => String(c.id).toLowerCase() === String(id).toLowerCase())
    if (card) {
      if (card.owned === 0) {
        // Si no la tenías, para que sea "repetida" debes tener mínimo 2 (1 en álbum, 1 extra)
        store.increment(card.id)
        store.increment(card.id)
      } else {
        store.increment(card.id)
      }
      agregadas++
    } else {
      // Si no existe, la agregamos con 2 para que cuente como repetida
      store.collection.push({
        id: String(id),
        name: `Carta ${id}`,
        owned: 2
      })
      agregadas++
    }
  })

  if (agregadas > 0) {
    showToast(`¡Éxito! Se añadieron ${agregadas} cartas repetidas.`, 'success')
  }

  bulkDuplicatesInput.value = ''
}

// Lógica para eliminar carta
const deleteCard = (id: string | number) => {
  showConfirm('¿Seguro que quieres eliminar esta carta de tu colección?', () => {
    const index = store.collection.findIndex(c => String(c.id) === String(id))
    if (index !== -1) {
      store.collection.splice(index, 1)
      showToast('Carta eliminada.', 'info')
    }
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

.card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.card-info {
  display: flex;
  flex-direction: column;
}

.card-id {
  font-size: 0.8rem;
  color: #666;
}

.card-name-input {
  border: 1px solid transparent;
  background: transparent;
  font-size: 1.1rem;
  font-weight: 500;
  padding: 0.2rem;
  width: 100%;
}

.card-name-input:focus {
  border-bottom: 1px solid #4285f4;
  outline: none;
  background: #fff;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn {
  width: 40px;
  height: 40px;
  font-size: 1.5rem;
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
  font-size: 1.2rem;
  font-weight: bold;
  min-width: 30px;
  text-align: center;
}

.has-duplicates {
  color: #1976d2;
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
