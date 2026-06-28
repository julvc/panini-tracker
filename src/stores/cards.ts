import { defineStore } from 'pinia'
import { supabase } from '../supabase'

export interface Card {
    id: string;
    name: string;
    owned: number;
    design?: string;
}

// Usamos un ID fijo para que la base de datos sea el Centro de la Verdad Global
const GLOBAL_ID = 'julvc-collection'

export const useCardStore = defineStore('cards', {
    state: () => ({
        collection: [] as Card[],
        isLoaded: false,
        deviceId: GLOBAL_ID,
        isAdmin: false
    }),
    getters: {
        totalCards: (state) => state.collection.reduce((acc, card) => acc + card.owned, 0),
        duplicates: (state) => state.collection.filter(c => c.owned > 1),
    },
    actions: {
        async checkAuth() {
            const { data: { session } } = await supabase.auth.getSession()
            this.isAdmin = !!session
        },
        async login(email: string, password: string) {
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) throw error
            this.isAdmin = true
        },
        async logout() {
            await supabase.auth.signOut()
            this.isAdmin = false
        },
        async loadFromDB() {
            const { data, error } = await supabase
                .from('user_cards')
                .select('*')
                .eq('device_id', this.deviceId)
            
            if (error) {
                console.error("Error al cargar de Supabase", error)
                return
            }

            if (data && data.length > 0) {
                this.collection = data.map(row => ({
                    id: row.card_id,
                    name: row.name,
                    owned: row.owned,
                    design: row.design
                }))
            }
            this.isLoaded = true
        },
        async saveCardToDB(card: Card) {
            const { error } = await supabase
                .from('user_cards')
                .upsert({
                    device_id: this.deviceId,
                    card_id: card.id,
                    name: card.name,
                    owned: card.owned,
                    design: card.design || 'normal'
                }, { onConflict: 'device_id, card_id' })
                
            if (error) {
                console.error("Error al guardar carta en Supabase", error)
            }
        },
        async saveAllToDB() {
            if (this.collection.length === 0) return;
            const rows = this.collection.map(card => ({
                device_id: this.deviceId,
                card_id: card.id,
                name: card.name,
                owned: card.owned,
                design: card.design || 'normal'
            }))
            // Supabase upsert masivo
            const { error } = await supabase
                .from('user_cards')
                .upsert(rows, { onConflict: 'device_id, card_id' })
                
            if (error) {
                console.error("Error al guardar lote en Supabase", error)
            }
        },
        async increment(id: string) {
            const card = this.collection.find(c => String(c.id) === String(id))
            if (card) {
                card.owned++
                await this.saveCardToDB(card)
            }
        },
        async decrement(id: string) {
            const card = this.collection.find(c => String(c.id) === String(id))
            if (card && card.owned > 0) {
                card.owned--
                await this.saveCardToDB(card)
            }
        },
        async deleteCard(id: string) {
            const index = this.collection.findIndex(c => String(c.id) === String(id))
            if (index !== -1) {
                this.collection.splice(index, 1)
                await supabase
                    .from('user_cards')
                    .delete()
                    .eq('device_id', this.deviceId)
                    .eq('card_id', id)
            }
        },
        async restoreCollection(newCollection: Card[]) {
            this.collection = newCollection
            await this.saveAllToDB()
        }
    }
})
