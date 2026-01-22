# Calculadora de Combustible - FAA

**Live:** https://fedesapuppo.github.io/fuel-calculator/

Aplicación web estática para calcular el costo de combustible en viajes entre bases de la Fuerza Aérea Argentina.

## Características

- **Selección de origen y destino** entre 14 ubicaciones
- **20 vehículos** con diferentes tipos de combustible y consumo
- **Búsqueda rápida** en todos los selectores
- **Viaje de ida o ida y vuelta**
- **Soporte para vehículos por hora** (tractores) con input de horas estimadas
- **Precios actualizados** automáticamente desde naftas.com.ar
- **Sin dependencias de API externas** - rutas pre-calculadas
- **Diseño responsive** (mobile-first)

## Estructura del Proyecto

```
fuel-calculator/
├── index.html                    # Aplicación principal
├── css/
│   └── style.css                 # Estilos personalizados
├── js/
│   └── app.js                    # Lógica de la aplicación
├── data/
│   ├── vehicles.json             # Lista de vehículos
│   ├── locations.json            # Bases aéreas con coordenadas
│   ├── fuel_prices.json          # Precios de combustible YPF
│   └── routes_cache.json         # Rutas pre-calculadas
├── scripts/
│   ├── scrape_fuel_prices.py     # Scraper de precios
│   └── generate_all_routes.py    # Generador de rutas
└── .github/
    └── workflows/
        └── update-fuel-prices.yml # Actualización automática mensual
```

## Instalación Local

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd fuel-calculator

# Iniciar servidor local
python3 -m http.server 8000

# Abrir en el navegador
open http://localhost:8000
```

## Despliegue en GitHub Pages

1. Subir el repositorio a GitHub
2. Ir a **Settings** → **Pages**
3. En **Source**, seleccionar la rama `main`
4. Guardar y esperar unos minutos

La aplicación estará disponible en `https://fedesapuppo.github.io/fuel-calculator/`

## Datos

### Vehículos

| Tipo | Combustible | Consumo |
|------|-------------|---------|
| Camiones | ULTRA (Gasoil) | 30-38 L/100km |
| Sprinters/Ducato | INFINIA DIESEL | 17 L/100km |
| Camionetas | ULTRA/INFINIA/NAFTA | 14-20 L/100km |
| Tractores | ULTRA | 6-12 L/hora |

### Combustibles (YPF)

| Código | Nombre | Descripción |
|--------|--------|-------------|
| NAFTA | Nafta Super | Nafta común |
| ULTRA | Gasoil | Diesel común |
| INFINIA_DIESEL | Infinia Diesel | Diesel premium |

### Ubicaciones (14)

**Brigadas Aéreas:**
- I Brigada Aérea (El Palomar)
- II Brigada Aérea (Paraná)
- III Brigada Aérea (Reconquista)
- IV Brigada Aérea (El Plumerillo)
- V Brigada Aérea (Villa Reynolds)
- VI Brigada Aérea (Tandil)
- IX Brigada Aérea (Comodoro Rivadavia)
- X Brigada Aérea (Río Gallegos)

**Bases Aéreas:**
- Base Aérea Militar Morón
- Base Aérea Militar Mar del Plata

**Áreas Logísticas:**
- Área Logística Córdoba
- Área Logística Palomar

**Áreas de Material:**
- Área de Material Quilmes
- Área de Material Río Cuarto

## Actualización de Datos

### Precios de Combustible

Los precios se actualizan automáticamente el 1° de cada mes mediante GitHub Actions.

Para actualizar manualmente:

```bash
# Crear entorno virtual (primera vez)
python3 -m venv .venv
source .venv/bin/activate
pip install requests beautifulsoup4

# Ejecutar scraper
python scripts/scrape_fuel_prices.py
```

### Agregar Nuevas Ubicaciones

1. Editar `data/locations.json` agregando la nueva ubicación con coordenadas exactas
2. Ejecutar el script para recalcular rutas (requiere API key de Google Distance Matrix):
   ```bash
   GOOGLE_API_KEY=tu_api_key python scripts/generate_all_routes.py
   ```
3. Commit y push de los cambios

### Agregar Nuevos Vehículos

Editar `data/vehicles.json` con el formato:

```json
{
  "id": "v21",
  "name": "NOMBRE DEL VEHÍCULO",
  "fuel_type": "ULTRA",
  "consumption": 15,
  "consumption_type": "per_100km"
}
```

Valores válidos:
- `fuel_type`: `NAFTA`, `ULTRA`, `INFINIA_DIESEL`
- `consumption_type`: `per_100km`, `per_hour`

## Cálculo de Costos

### Vehículos por km (per_100km)

```
litros = (distancia_km / 100) × consumo
costo = litros × precio_combustible
```

### Vehículos por hora (per_hour)

```
litros = horas × consumo
costo = litros × precio_combustible
```

Para viajes de ida y vuelta, los valores se duplican.

## Cálculo de Distancias

Las distancias están pre-calculadas usando **Google Distance Matrix API** con coordenadas exactas de cada ubicación. Los datos se almacenan en `data/routes_cache.json` para evitar llamadas a la API en tiempo de ejecución.

## Tecnologías

- HTML5
- CSS3 + [Tailwind CSS](https://tailwindcss.com/) (CDN)
- JavaScript (Vanilla)
- Python 3 (scripts de mantenimiento)
- GitHub Actions (automatización)

## Licencia

Uso interno - Fuerza Aérea Argentina
