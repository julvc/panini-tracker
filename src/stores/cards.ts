import { defineStore } from 'pinia'
import localforage from 'localforage'

export interface Card {
    id: string;
    name: string;
    owned: number;
}

export const useCardStore = defineStore('cards', {
    state: () => ({
        collection: [
            // Datos iniciales de prueba (puedes cargar un JSON real luego)
            { id: 'BASE-001', name: 'Escudo Real Madrid', owned: 0 },
            { id: 'BASE-002', name: 'Vinícius Jr.', owned: 1 },
            { id: 'BASE-003', name: 'Lamine Yamal', owned: 2 },
        ] as Card[],
        isLoaded: false
    }),
    getters: {
        totalCards: (state) => state.collection.reduce((acc, card) => acc + card.owned, 0),
        duplicates: (state) => state.collection.filter(c => c.owned > 1),
    },
    actions: {
        async loadFromDB() {
            const stored = await localforage.getItem<Card[]>('adrenalyn_collection')
            if (stored && stored.length > 0) {
                this.collection = stored
            }
            this.isLoaded = true
        },
        async saveToDB() {
            await localforage.setItem('adrenalyn_collection', JSON.parse(JSON.stringify(this.collection)))
        },
        async increment(id: string) {
            const card = this.collection.find(c => c.id === id)
            if (card) {
                card.owned++
                await this.saveToDB()
            }
        },
        async decrement(id: string) {
            const card = this.collection.find(c => c.id === id)
            if (card && card.owned > 0) {
                card.owned--
                await this.saveToDB()
            }
        },
        // Permite sobreescribir la colección entera si se descarga un backup
        async restoreCollection(newCollection: Card[]) {
            this.collection = newCollection
            await this.saveToDB()
        }
    }
})
