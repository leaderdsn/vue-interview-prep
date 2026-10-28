import 'primeicons/primeicons.css'
import './styles/main.sass'

import { createApp } from 'vue'

import App from './App.vue'
import { installProviders } from './providers'

const app = createApp(App)

installProviders(app)

app.mount('#app')
