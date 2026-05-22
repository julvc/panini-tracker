<template>
  <div class="tracker-container">
    <header class="header">
      <h1>Adrenalyn XL</h1>
      <div class="drive-buttons">
        <button @click="restoreFromDrive" class="btn-sync btn-restore" :disabled="isSyncing">
          Restaurar desde Drive
        </button>
        <button @click="backupToDrive" class="btn-sync" :disabled="isSyncing">
          {{ isSyncing ? 'Sincronizando...' : 'Respaldar en Drive' }}
        </button>
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
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCardStore } from '../stores/cards'

const store = useCardStore()
const isSyncing = ref(false)

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

// Reemplaza esto con el Client ID de tu proyecto en Google Cloud Console
const GOOGLE_CLIENT_ID = 'TU_CLIENT_ID_AQUÍ.apps.googleusercontent.com'
// Reemplaza esto con tu API Key de Google Cloud Console
const GOOGLE_API_KEY = 'TU_API_KEY_AQUÍ'

onMounted(async () => {
  await store.loadFromDB()
  
  // Recuperar de localStorage si la base de datos de la store no cargó nada
  if (store.collection && store.collection.length > 0 && store.totalCards === 0) {
    const localData = localStorage.getItem('adrenalyn_local_backup')
    if (localData) {
      store.collection = JSON.parse(localData)
    }
  }
  // Cargar el script de Google API Client para el Picker
  const script = document.createElement('script')
  script.src = 'https://apis.google.com/js/api.js'
  script.async = true
  script.defer = true
  script.onload = () => {
    // @ts-ignore
    gapi.load('picker', () => {})
  }
  document.body.appendChild(script)
})

// Guardar automáticamente en localStorage cada vez que haya un cambio
watch(() => store.collection, (newCollection) => {
  localStorage.setItem('adrenalyn_local_backup', JSON.stringify(newCollection))
}, { deep: true })

const backupToDrive = () => {
  isSyncing.value = true
  
  // @ts-ignore - 'google' es inyectado globalmente por el script en index.html
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    callback: async (response: any) => {
      if (response.access_token) {
        await uploadJsonToDrive(response.access_token)
      } else {
        isSyncing.value = false
        alert('Error obteniendo token de Google')
      }
    },
    error_callback: () => {
      isSyncing.value = false
      alert('Error en la autenticación')
    }
  })
  
  client.requestAccessToken()
}

const uploadJsonToDrive = async (token: string) => {
  try {
    const fileContent = JSON.stringify(store.collection)
    const metadata = {
      name: 'adrenalyn_backup.json',
      mimeType: 'application/json'
    }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([fileContent], { type: 'application/json' }))

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}` 
      },
      body: form
    })

    if (res.ok) {
      alert('Respaldo exitoso en Drive')
    } else {
      throw new Error('Error al subir a Drive')
    }
  } catch (error) {
    console.error(error)
    alert('Falló el respaldo')
  } finally {
    isSyncing.value = false
  }
}

const restoreFromDrive = () => {
  // @ts-ignore
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    callback: (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        createPicker(tokenResponse.access_token)
      }
    }
  })
  client.requestAccessToken()
}

const createPicker = (accessToken: string) => {
  // @ts-ignore
  const view = new google.picker.View(google.picker.ViewId.DOCS)
  view.setMimeTypes('application/json')

  // @ts-ignore
  const picker = new google.picker.PickerBuilder()
    .setAppId(GOOGLE_CLIENT_ID.split('-')[0]) // No es el client ID completo, solo el número de proyecto
    .setOAuthToken(accessToken)
    .addView(view)
    .setDeveloperKey(GOOGLE_API_KEY)
    .setCallback(pickerCallback)
    .build()
  picker.setVisible(true)
}

const pickerCallback = async (data: any) => {
  // @ts-ignore
  if (data[google.picker.Action.PICKED]) {
    // @ts-ignore
    const doc = data[google.picker.Response.DOCUMENTS][0]
    const fileId = doc.id

    // @ts-ignore
    const token = gapi.client.getToken().access_token
    if (!token) {
      alert('No se pudo obtener el token para descargar el archivo.')
      return
    }

    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!res.ok) throw new Error('Error al descargar el archivo desde Drive.')

      const collectionData = await res.json()

      if (confirm('¿Estás seguro de que quieres reemplazar tu colección actual con los datos del respaldo? Esta acción no se puede deshacer.')) {
        store.collection = collectionData
        alert('Colección restaurada exitosamente.')
      }
    } catch (error) {
      console.error(error)
      alert('Error al procesar el archivo de respaldo.')
    }
  }
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
    alert(`¡Éxito! Se agregaron o marcaron ${agregadas} cartas como obtenidas.`)
  } else if (yaExistian > 0) {
    alert(`No se agregó nada nuevo. Las cartas ingresadas ya las tenías registradas.`)
  }

  bulkOwnedInput.value = ''
}

const processBulkDuplicates = () => {
  const ids = parseCardIds(bulkDuplicatesInput.value)
  let agregadas = 0

  ids.forEach(id => {
    const card = store.collection.find(c => String(c.id).toLowerCase() === String(id).toLowerCase())
    if (card) {
      store.increment(card.id)
      agregadas++
    } else {
      // Si no existe, la agregamos directamente como repetida
      store.collection.push({
        id: String(id),
        name: `Carta ${id}`,
        owned: 2
      })
      agregadas++
    }
  })

  if (agregadas > 0) {
    alert(`¡Éxito! Se añadieron ${agregadas} cartas repetidas.`)
  }

  bulkDuplicatesInput.value = ''
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

.card-count {
  font-size: 1.2rem;
  font-weight: bold;
  min-width: 30px;
  text-align: center;
}

.has-duplicates {
  color: #1976d2;
}
</style>
