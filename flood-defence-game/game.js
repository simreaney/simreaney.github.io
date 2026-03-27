/* ============================================================
   FLOOD DEFENCE – Main Game Logic
   A turn-based hex-grid town-building / flood-defence game
   ============================================================ */

// ===================== CONFIGURATION ========================
const CONFIG = {
    // Grid
    GRID_COLS: 50,
    GRID_ROWS: 20,
    HEX_SIZE: 28, // outer radius of each hexagon

    // Economy
    START_MONEY: 200,
    HOUSE_INCOME: 5,
    WALL_COST: 500,

    // Flood frequency – configurable!
    // Each entry: { magnitude: metres, returnPeriod: turns }
    // A flood of that magnitude occurs on average once every returnPeriod turns.
    // We fit a Gumbel distribution through these anchor points.
    FLOOD_ANCHORS: [
        { magnitude: 1.5, returnPeriod: 10 },
        { magnitude: 2.5, returnPeriod: 30 },
        { magnitude: 5.0, returnPeriod: 50 },
    ],

    // Visual
    RIVER_COLOR: '#2e86c1',
    RIVER_COLOR_DARK: '#1a5276',
    WATER_FLOOD_COLOR: 'rgba(52, 152, 219, 0.55)',
    WALL_COLOR: '#7f8c8d',
    WALL_OUTLINE: '#4a4a4a',
    HOUSE_COLORS: ['#c0392b', '#d35400', '#e67e22', '#8e44ad', '#2980b9', '#27ae60'],
};

// ===================== STATE ================================
let state = {};

function initState() {
    state = {
        money: CONFIG.START_MONEY,
        turn: 1,
        tool: 'house', // 'house' | 'wall'
        grid: [],       // 2D array [col][row]
        gameOver: false,
        floodAnimProgress: 0,
        floodedCells: new Set(),
        lastFloodMag: 0,
        housesDestroyed: 0,
        floodStartTime: 0,
        waterParticles: [], // animated particles for water effects
        housesBuiltThisTurn: 0,
    };
}

// ===================== HEX MATH =============================
// Flat-top hexagons with offset coordinates (even-q).
// col = q, row = r

function hexWidth() {
    return CONFIG.HEX_SIZE * 2;
}

function hexHeight() {
    return Math.sqrt(3) * CONFIG.HEX_SIZE;
}

function hexToPixel(col, row) {
    const w = hexWidth();
    const h = hexHeight();
    const x = col * (w * 0.75);
    const y = row * h + (col % 2 === 1 ? h * 0.5 : 0);
    return { x, y };
}

function pixelToHex(px, py, offsetX, offsetY) {
    const wx = (px - offsetX);
    const wy = (py - offsetY);

    const w = hexWidth();
    const h = hexHeight();

    // Approximate column
    const col = Math.round(wx / (w * 0.75));
    // Approximate row based on column offset
    const rowOffset = col % 2 === 1 ? h * 0.5 : 0;
    const row = Math.round((wy - rowOffset) / h);

    // Check col and nearby columns for closest hex center
    let bestCol = col, bestRow = row, bestDist = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || c >= CONFIG.GRID_COLS || r < 0 || r >= CONFIG.GRID_ROWS) continue;
            const center = hexToPixel(c, r);
            const dist = (center.x - wx) ** 2 + (center.y - wy) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                bestCol = c;
                bestRow = r;
            }
        }
    }
    if (bestCol < 0 || bestCol >= CONFIG.GRID_COLS || bestRow < 0 || bestRow >= CONFIG.GRID_ROWS) return null;
    return { col: bestCol, row: bestRow };
}

function hexNeighbors(col, row) {
    // Even-q offset neighbors (flat-top)
    const even = [
        [+1, -1], [+1, 0], [0, +1],
        [-1, 0], [-1, -1], [0, -1],
    ];
    const odd = [
        [+1, 0], [+1, +1], [0, +1],
        [-1, +1], [-1, 0], [0, -1],
    ];
    const offsets = col % 2 === 0 ? even : odd;
    const result = [];
    for (const [dc, dr] of offsets) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc >= 0 && nc < CONFIG.GRID_COLS && nr >= 0 && nr < CONFIG.GRID_ROWS) {
            result.push({ col: nc, row: nr });
        }
    }
    return result;
}

function hexCorners(cx, cy) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i);
        corners.push({
            x: cx + CONFIG.HEX_SIZE * Math.cos(angle),
            y: cy + CONFIG.HEX_SIZE * Math.sin(angle),
        });
    }
    return corners;
}

// ===================== NOISE FUNCTIONS ========================

// Seeded random number generator for reproducible randomness
function seededRandom(seed) {
    return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

// Simple 2D Perlin-like noise using hash and interpolation
function perlinNoise(x, y, scale, seed) {
    const rng = seededRandom(seed);
    
    const xi = Math.floor(x / scale);
    const yi = Math.floor(y / scale);
    const xf = (x / scale) - xi;
    const yf = (y / scale) - yi;
    
    // Hash function for grid points
    function hash(gridX, gridY, s) {
        const rngLocal = seededRandom(s + gridX * 73856093 ^ gridY * 19349663);
        return rngLocal();
    }
    
    // Smooth interpolation (fade function)
    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    // Linear interpolation
    function lerp(t, a, b) {
        return a + t * (b - a);
    }
    
    // Get corner values
    const n00 = hash(xi, yi, seed);
    const n10 = hash(xi + 1, yi, seed);
    const n01 = hash(xi, yi + 1, seed);
    const n11 = hash(xi + 1, yi + 1, seed);
    
    // Interpolate
    const u = fade(xf);
    const v = fade(yf);
    
    const nx0 = lerp(u, n00, n10);
    const nx1 = lerp(u, n01, n11);
    const nxy = lerp(v, nx0, nx1);
    
    return nxy;
}

// Generate layered noise (Perlin-style fractal Brownian motion)
function fbmNoise(x, y, octaves, seed) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        value += amplitude * (perlinNoise(x * frequency, y * frequency, 1, seed + i) * 2 - 1);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    
    return value / maxValue;
}

// ===================== GRID SETUP ============================

function createGrid() {
    const cols = CONFIG.GRID_COLS;
    const rows = CONFIG.GRID_ROWS;
    const grid = [];

    // Generate a random seed for this game
    const mapSeed = Math.random() * 1000000;

    // Generate elevation map using noise
    const elevationMap = [];
    let maxElevation = 0;
    
    for (let c = 0; c < cols; c++) {
        elevationMap[c] = [];
        for (let r = 0; r < rows; r++) {
            // Use FBM noise to create smooth, natural-looking terrain
            const noiseVal = fbmNoise(c * 0.08, r * 0.12, 4, mapSeed);
            // Scale noise to reasonable elevation range
            const elevation = (noiseVal + 1) * 2.5;
            elevationMap[c][r] = elevation;
            maxElevation = Math.max(maxElevation, elevation);
        }
    }

    // Normalize elevations so max is 5 (before applying river scaling)
    const elevationScale = maxElevation > 0 ? 5 / maxElevation : 1;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            elevationMap[c][r] *= elevationScale;
        }
    }

    // Find river path - follows lowest elevation in each column
    const riverCenter = [];
    for (let c = 0; c < cols; c++) {
        let minElev = Infinity;
        let minRow = c === 0 ? Math.floor(rows / 2) : riverCenter[c - 1];
        
        // Find row with lowest elevation in this column
        for (let r = Math.max(0, rows / 2 - 8); r < Math.min(rows, rows / 2 + 8); r++) {
            if (elevationMap[c][r] < minElev) {
                minElev = elevationMap[c][r];
                minRow = r;
            }
        }
        
        // Ensure connectivity: limit movement from previous column
        if (c > 0) {
            const prevRow = riverCenter[c - 1];
            // Constrain to at most ±1 from previous row
            minRow = Math.max(prevRow - 1, Math.min(prevRow + 1, minRow));
            minRow = Math.max(2, Math.min(rows - 3, minRow));
        }
        
        riverCenter.push(minRow);
    }

    // Create grid with river and calculated elevations
    // First pass: calculate elevations to find maximum
    const tempElevations = [];
    let maxFinalElevation = 0;
    
    for (let c = 0; c < cols; c++) {
        tempElevations[c] = [];
        for (let r = 0; r < rows; r++) {
            const distFromRiver = Math.abs(r - riverCenter[c]);
            const isRiver = distFromRiver <= 1;

            let elevation = 0;
            if (!isRiver) {
                // Apply distance-based scaling
                elevation = elevationMap[c][r] * (1 + distFromRiver * 0.1);
                elevation = Math.max(0.1, elevation);
            }
            
            tempElevations[c][r] = elevation;
            maxFinalElevation = Math.max(maxFinalElevation, elevation);
        }
    }

    // Rescale so maximum elevation is 5m
    const finalElevationScale = maxFinalElevation > 0 ? 5 / maxFinalElevation : 1;
    
    for (let c = 0; c < cols; c++) {
        grid[c] = [];
        for (let r = 0; r < rows; r++) {
            const distFromRiver = Math.abs(r - riverCenter[c]);
            const isRiver = distFromRiver <= 1;

            let elevation = 0;
            if (!isRiver) {
                elevation = tempElevations[c][r] * finalElevationScale;
            }

            grid[c][r] = {
                col: c,
                row: r,
                isRiver,
                elevation: Math.round(elevation * 100) / 100,
                building: null, // null | 'house' | 'wall'
                flooded: false,
                floodedTime: null,
                houseColor: CONFIG.HOUSE_COLORS[Math.floor(Math.random() * CONFIG.HOUSE_COLORS.length)],
            };
        }
    }

    state.grid = grid;
}

// ===================== FLOOD MODEL ===========================

// Fit Gumbel distribution from two anchor points.
// CDF: F(x) = exp(-exp(-(x - mu) / beta))
// Probability of exceedance in one turn = 1 / returnPeriod
// So F(x) = 1 - 1/returnPeriod

let gumbelMu = 0;
let gumbelBeta = 1;

function fitGumbel() {
    const a = CONFIG.FLOOD_ANCHORS[0];
    const b = CONFIG.FLOOD_ANCHORS[1];

    const F1 = 1 - 1 / a.returnPeriod;
    const F2 = 1 - 1 / b.returnPeriod;

    // -ln(-ln(F)) = (x - mu) / beta
    const y1 = -Math.log(-Math.log(F1));
    const y2 = -Math.log(-Math.log(F2));

    gumbelBeta = (b.magnitude - a.magnitude) / (y2 - y1);
    gumbelMu = a.magnitude - gumbelBeta * y1;
}

function sampleFloodMagnitude() {
    // Inverse CDF sampling: x = mu - beta * ln(-ln(u)),  u ~ Uniform(0,1)
    const u = Math.random();
    const x = gumbelMu - gumbelBeta * Math.log(-Math.log(u));
    return Math.max(0, x);
}

// ===================== FLOOD SIMULATION ======================

function simulateFlood() {
    const mag = sampleFloodMagnitude();
    state.lastFloodMag = Math.round(mag * 100) / 100;
    state.floodStartTime = Date.now(); // Track when flood starts for animation

    // Clear previous flood state
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            state.grid[c][r].flooded = false;
            state.grid[c][r].floodedTime = null;
        }
    }

    if (mag <= 0) {
        state.floodedCells = new Set();
        return;
    }

    // BFS from all river cells – flood spreads to adjacent cells
    // with elevation < mag, but cannot pass through walls.
    const visited = new Set();
    const queue = [];

    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            if (state.grid[c][r].isRiver) {
                const key = c + ',' + r;
                visited.add(key);
                queue.push({ col: c, row: r, distance: 0 });
                state.grid[c][r].flooded = true;
                state.grid[c][r].floodedTime = state.floodStartTime;
            }
        }
    }

    let head = 0;
    while (head < queue.length) {
        const { col, row, distance } = queue[head++];
        for (const nb of hexNeighbors(col, row)) {
            const key = nb.col + ',' + nb.row;
            if (visited.has(key)) continue;
            visited.add(key);

            const cell = state.grid[nb.col][nb.row];
            if (cell.building === 'wall') continue;   // wall blocks
            if (cell.isRiver || cell.elevation < mag) {
                cell.flooded = true;
                // Stagger flood animation based on BFS distance
                cell.floodedTime = state.floodStartTime + distance * 50;
                queue.push({ col: nb.col, row: nb.row, distance: distance + 1 });
            }
        }
    }

    // Destroy flooded houses
    state.housesDestroyed = 0;
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            const cell = state.grid[c][r];
            if (cell.flooded && cell.building === 'house') {
                cell.building = null;
                state.housesDestroyed++;
            }
        }
    }

    state.floodedCells = visited;
}

// ===================== ECONOMY ===============================

function countHouses() {
    let count = 0;
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            if (state.grid[c][r].building === 'house') count++;
        }
    }
    return count;
}

function getIncome() {
    return countHouses() * CONFIG.HOUSE_INCOME;
}

// ===================== RENDERING =============================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let camX = 0, camY = 0;
let hoverHex = null;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function centerCamera() {
    const totalW = CONFIG.GRID_COLS * hexWidth() * 0.75 + hexWidth() * 0.25;
    const totalH = CONFIG.GRID_ROWS * hexHeight() + hexHeight() * 0.5;
    camX = (canvas.width - totalW) / 2;
    camY = (canvas.height - totalH) / 2 + 28; // offset for HUD
}

function getElevationColor(elevation) {
    // Rich terrain palette: lush green lowlands -> golden-brown highlands
    const t = Math.min(elevation / 5, 1);
    const r = Math.round(46 + t * 140);   // 46 -> 186
    const g = Math.round(160 + t * (-80)); // 160 -> 80
    const b = Math.round(50 + t * 10);     // 50 -> 60
    return `rgb(${r},${g},${b})`;
}

function getElevationColorDark(elevation) {
    const t = Math.min(elevation / 5, 1);
    const r = Math.round(34 + t * 110);
    const g = Math.round(130 + t * (-65));
    const b = Math.round(38 + t * 8);
    return `rgb(${r},${g},${b})`;
}

function drawHex(cx, cy, cell) {
    const corners = hexCorners(cx, cy);

    // --- Base hex fill ---
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();

    if (cell.isRiver) {
        // Deep animated water with multi-layered flow
        const t = Date.now();
        const wave1 = Math.sin(t * 0.003 + cell.col * 0.4 - cell.row * 0.15);
        const wave2 = Math.sin(t * 0.005 + cell.col * 0.7 + cell.row * 0.2);
        const wave3 = Math.sin(t * 0.002 + cell.col * 0.15);
        const combined = (wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25);

        const rb = Math.round(30 + combined * 18);
        const gb = Math.round(110 + combined * 35);
        const bb = Math.round(190 + combined * 25);
        ctx.fillStyle = `rgb(${rb},${gb},${bb})`;
    } else {
        ctx.fillStyle = getElevationColor(cell.elevation);
    }
    ctx.fill();

    // Outline
    ctx.strokeStyle = cell.isRiver ? CONFIG.RIVER_COLOR_DARK : getElevationColorDark(cell.elevation);
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Animated river surface detail ---
    if (cell.isRiver) {
        const t = Date.now();
        // Flowing specular highlights
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.clip();

        // Animated curved flow lines
        for (let i = -1; i <= 1; i++) {
            const phase = (t * 0.04 + cell.col * 12 + i * 14) % 50;
            const yOff = cy - CONFIG.HEX_SIZE + phase;
            const xWobble = Math.sin(t * 0.003 + cell.col * 0.6 + i) * 4;
            const alpha = 0.12 + Math.sin(t * 0.004 + i * 2) * 0.06;
            ctx.strokeStyle = `rgba(180, 220, 255, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - CONFIG.HEX_SIZE * 0.6 + xWobble, yOff);
            ctx.quadraticCurveTo(cx + xWobble * 0.5, yOff + 5, cx + CONFIG.HEX_SIZE * 0.6 + xWobble, yOff);
            ctx.stroke();
        }
        ctx.restore();
    }

    // --- Flood overlay with animation ---
    if (cell.flooded && !cell.isRiver) {
        const t = Date.now();
        const timeElapsed = t - (cell.floodedTime || state.floodStartTime);
        const spreadAnim = Math.min(1, timeElapsed / 400);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.clip();

        // Rising water fill with shimmer
        const waterWave = Math.sin(t * 0.004 + cell.col * 0.5 + cell.row * 0.35) * 0.08;
        const baseAlpha = 0.5 * spreadAnim;
        const finalAlpha = Math.min(0.65, baseAlpha + waterWave);

        ctx.fillStyle = `rgba(41, 128, 185, ${finalAlpha})`;
        ctx.fill();

        // Animated ripple rings expanding outward
        if (spreadAnim > 0.2) {
            const ripplePhase = ((t * 0.002 + cell.col * 1.3 + cell.row * 0.9) % 1);
            const rippleRadius = CONFIG.HEX_SIZE * 0.15 + ripplePhase * CONFIG.HEX_SIZE * 0.5;
            const rippleAlpha = (1 - ripplePhase) * 0.35 * spreadAnim;
            ctx.strokeStyle = `rgba(133, 193, 233, ${rippleAlpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Second ripple offset
            const ripplePhase2 = ((t * 0.002 + cell.col * 1.3 + cell.row * 0.9 + 0.5) % 1);
            const rippleRadius2 = CONFIG.HEX_SIZE * 0.15 + ripplePhase2 * CONFIG.HEX_SIZE * 0.5;
            const rippleAlpha2 = (1 - ripplePhase2) * 0.25 * spreadAnim;
            ctx.strokeStyle = `rgba(174, 214, 241, ${rippleAlpha2})`;
            ctx.beginPath();
            ctx.arc(cx, cy, rippleRadius2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Subtle flow lines on flood surface
        const flowPhase = (t * 0.03 + cell.col * 8) % 30;
        const flowAlpha = 0.1 * spreadAnim;
        ctx.strokeStyle = `rgba(200, 230, 255, ${flowAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const fy = cy - CONFIG.HEX_SIZE * 0.5 + flowPhase;
        ctx.moveTo(cx - CONFIG.HEX_SIZE * 0.5, fy);
        ctx.quadraticCurveTo(cx, fy + 3, cx + CONFIG.HEX_SIZE * 0.5, fy);
        ctx.stroke();

        ctx.restore();
    }

    // --- Buildings ---
    if (cell.building === 'house') {
        drawHouse(cx, cy, cell.houseColor);
    } else if (cell.building === 'wall') {
        drawWall(cx, cy);
    }

    // --- Hover ---
    if (hoverHex && hoverHex.col === cell.col && hoverHex.row === cell.row && !state.gameOver) {
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawHouse(cx, cy, color) {
    const s = CONFIG.HEX_SIZE * 0.6;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.85, s * 0.75, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.65, cy - s * 0.15, s * 1.3, s * 0.95);

    // Body shading (darker bottom edge)
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(cx - s * 0.65, cy + s * 0.5, s * 1.3, s * 0.3);

    // Roof
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy - s * 0.15);
    ctx.lineTo(cx, cy - s * 1.05);
    ctx.lineTo(cx + s * 0.85, cy - s * 0.15);
    ctx.closePath();
    ctx.fillStyle = '#922b21';
    ctx.fill();
    // Roof highlight
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy - s * 0.15);
    ctx.lineTo(cx, cy - s * 1.05);
    ctx.lineTo(cx, cy - s * 0.15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    // Chimney
    ctx.fillStyle = '#6c3020';
    ctx.fillRect(cx + s * 0.32, cy - s * 1.15, s * 0.22, s * 0.5);
    ctx.fillStyle = '#555';
    ctx.fillRect(cx + s * 0.28, cy - s * 1.18, s * 0.3, s * 0.08);

    // Door
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(cx - s * 0.14, cy + s * 0.25, s * 0.28, s * 0.55);
    // Doorknob
    ctx.fillStyle = '#f9ca24';
    ctx.beginPath();
    ctx.arc(cx + s * 0.07, cy + s * 0.52, s * 0.035, 0, Math.PI * 2);
    ctx.fill();

    // Windows
    ctx.fillStyle = '#f9e87c';
    ctx.fillRect(cx + s * 0.25, cy + s * 0.0, s * 0.25, s * 0.25);
    ctx.fillRect(cx - s * 0.5, cy + s * 0.0, s * 0.25, s * 0.25);

    // Window cross bars
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 0.8;
    // Left window
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy + s * 0.125);
    ctx.lineTo(cx - s * 0.25, cy + s * 0.125);
    ctx.moveTo(cx - s * 0.375, cy + s * 0.0);
    ctx.lineTo(cx - s * 0.375, cy + s * 0.25);
    ctx.stroke();
    // Right window
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.25, cy + s * 0.125);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.125);
    ctx.moveTo(cx + s * 0.375, cy + s * 0.0);
    ctx.lineTo(cx + s * 0.375, cy + s * 0.25);
    ctx.stroke();

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - s * 0.65, cy - s * 0.15, s * 1.3, s * 0.95);
}

function drawWall(cx, cy) {
    const s = CONFIG.HEX_SIZE * 0.65;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.55, s * 0.9, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bottom row of blocks (3 bricks)
    const blockColors = ['#7f8c8d', '#95a5a6', '#85929e'];
    for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = blockColors[i + 1];
        ctx.fillRect(cx + i * s * 0.55 - s * 0.24, cy + s * 0.02, s * 0.47, s * 0.38);
        // Brick highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx + i * s * 0.55 - s * 0.24, cy + s * 0.02, s * 0.47, s * 0.12);
    }
    // Top row (2 offset bricks)
    for (let i = 0; i <= 1; i++) {
        ctx.fillStyle = blockColors[i];
        ctx.fillRect(cx + (i - 0.5) * s * 0.55 - s * 0.24, cy - s * 0.38, s * 0.47, s * 0.38);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx + (i - 0.5) * s * 0.55 - s * 0.24, cy - s * 0.38, s * 0.47, s * 0.12);
    }

    // Mortar lines
    ctx.strokeStyle = CONFIG.WALL_OUTLINE;
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
        ctx.strokeRect(cx + i * s * 0.55 - s * 0.24, cy + s * 0.02, s * 0.47, s * 0.38);
    }
    for (let i = 0; i <= 1; i++) {
        ctx.strokeRect(cx + (i - 0.5) * s * 0.55 - s * 0.24, cy - s * 0.38, s * 0.47, s * 0.38);
    }

    // Top cap with bevelled look
    ctx.fillStyle = '#6c7a7a';
    ctx.fillRect(cx - s * 0.82, cy - s * 0.58, s * 1.64, s * 0.18);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - s * 0.82, cy - s * 0.58, s * 1.64, s * 0.06);
    ctx.strokeStyle = CONFIG.WALL_OUTLINE;
    ctx.strokeRect(cx - s * 0.82, cy - s * 0.58, s * 1.64, s * 0.18);
}

function drawGrid() {
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            const pos = hexToPixel(c, r);
            drawHex(pos.x + camX, pos.y + camY, state.grid[c][r]);
        }
    }
}

// Simple decorative clouds
const clouds = [];
function initClouds() {
    clouds.length = 0;
    for (let i = 0; i < 8; i++) {
        clouds.push({
            x: Math.random() * 2000 - 200,
            y: 60 + Math.random() * 80,
            w: 80 + Math.random() * 120,
            speed: 0.1 + Math.random() * 0.2,
        });
    }
}

function drawClouds() {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (const c of clouds) {
        c.x += c.speed;
        if (c.x > canvas.width + 200) c.x = -c.w - 50;
        const cy = c.y;
        ctx.beginPath();
        ctx.ellipse(c.x, cy, c.w * 0.5, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.w * 0.2, cy - 8, c.w * 0.3, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.w * 0.2, cy - 5, c.w * 0.25, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Decorative trees on empty land cells
function drawTree(cx, cy, cell) {
    // Only draw on empty land cells with some probability based on position
    if (cell.isRiver || cell.building || cell.flooded) return;

    // Deterministic "random" based on position – only some cells get trees
    const hash = Math.sin(cell.col * 127.1 + cell.row * 311.7) * 43758.5453;
    const frac = hash - Math.floor(hash);
    if (frac > 0.2) return; // ~20% chance of tree

    const s = CONFIG.HEX_SIZE * 0.35;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.7, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#5d3a1a';
    ctx.fillRect(cx - s * 0.12, cy - s * 0.2, s * 0.24, s * 1.0);

    // Bottom canopy layer (widest)
    ctx.fillStyle = '#1e8449';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, cy - s * 0.2);
    ctx.lineTo(cx, cy - s * 1.3);
    ctx.lineTo(cx + s * 0.9, cy - s * 0.2);
    ctx.closePath();
    ctx.fill();

    // Middle canopy layer
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.7, cy - s * 0.8);
    ctx.lineTo(cx, cy - s * 1.7);
    ctx.lineTo(cx + s * 0.7, cy - s * 0.8);
    ctx.closePath();
    ctx.fill();

    // Top canopy layer
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy - s * 1.3);
    ctx.lineTo(cx, cy - s * 2.0);
    ctx.lineTo(cx + s * 0.45, cy - s * 1.3);
    ctx.closePath();
    ctx.fill();
}

function drawTrees() {
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            const pos = hexToPixel(c, r);
            drawTree(pos.x + camX, pos.y + camY, state.grid[c][r]);
        }
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky gradient background - richer palette
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#2980b9');
    grad.addColorStop(0.3, '#5dade2');
    grad.addColorStop(0.65, '#aed6f1');
    grad.addColorStop(1, '#d5f5e3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawClouds();
    drawGrid();
    drawTrees();

    requestAnimationFrame(render);
}

// ===================== HUD UPDATE ============================

function updateHUD() {
    document.getElementById('money-display').textContent = `£${state.money}`;
    document.getElementById('income-display').textContent = `Income: £${getIncome()}/turn`;
    document.getElementById('turn-display').textContent = `Turn: ${state.turn}`;
}

// ===================== INPUT =================================

// Panning
let isPanning = false;
let panStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        camStart = { x: camX, y: camY };
        e.preventDefault();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        camX = camStart.x + (e.clientX - panStart.x);
        camY = camStart.y + (e.clientY - panStart.y);
        return;
    }

    const hex = pixelToHex(e.clientX, e.clientY, camX, camY);
    hoverHex = hex;

    // Update tooltip
    const tooltip = document.getElementById('tooltip');
    if (hex && state.grid[hex.col] && state.grid[hex.col][hex.row]) {
        const cell = state.grid[hex.col][hex.row];
        let text = '';
        if (cell.isRiver) {
            text = 'River (0.0m)';
        } else {
            text = `Elevation: ${cell.elevation.toFixed(2)}m`;
            if (cell.building) text += ` | ${cell.building === 'house' ? '🏠 House' : '🧱 Wall'}`;
            if (cell.flooded) text += ' | 🌊 Flooded';
        }
        tooltip.textContent = text;
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY + 14) + 'px';
        tooltip.classList.remove('hidden');
    } else {
        tooltip.classList.add('hidden');
    }
});

canvas.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
    }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Click to place building
canvas.addEventListener('click', (e) => {
    if (state.gameOver) return;

    const hex = pixelToHex(e.clientX, e.clientY, camX, camY);
    if (!hex) return;

    const cell = state.grid[hex.col][hex.row];
    if (cell.isRiver) return;
    if (cell.building) return;

    if (state.tool === 'house') {
        if (state.housesBuiltThisTurn < 3) {
            cell.building = 'house';
            cell.houseColor = CONFIG.HOUSE_COLORS[Math.floor(Math.random() * CONFIG.HOUSE_COLORS.length)];
            state.housesBuiltThisTurn++;
            updateHUD();
        }
    } else if (state.tool === 'wall') {
        if (state.money >= CONFIG.WALL_COST) {
            state.money -= CONFIG.WALL_COST;
            cell.building = 'wall';
            updateHUD();
        }
    }
});

// Scroll to zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.93 : 1.07;
    const oldSize = CONFIG.HEX_SIZE;
    CONFIG.HEX_SIZE = Math.max(12, Math.min(60, CONFIG.HEX_SIZE * zoomFactor));

    // Adjust camera to zoom toward cursor
    const ratio = CONFIG.HEX_SIZE / oldSize;
    camX = e.clientX - (e.clientX - camX) * ratio;
    camY = e.clientY - (e.clientY - camY) * ratio;
}, { passive: false });

// Tool buttons
document.getElementById('btn-house').addEventListener('click', () => {
    state.tool = 'house';
    document.getElementById('btn-house').classList.add('active');
    document.getElementById('btn-wall').classList.remove('active');
});

document.getElementById('btn-wall').addEventListener('click', () => {
    state.tool = 'wall';
    document.getElementById('btn-wall').classList.add('active');
    document.getElementById('btn-house').classList.remove('active');
});

// End turn
document.getElementById('btn-end-turn').addEventListener('click', () => {
    if (state.gameOver) return;
    endTurn();
});

document.getElementById('flood-alert-ok').addEventListener('click', () => {
    document.getElementById('flood-alert').classList.add('hidden');
    checkGameOver();
});

document.getElementById('game-over-restart').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    startGame();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (state.gameOver) return;
    if (e.key === '1' || e.key === 'h') {
        document.getElementById('btn-house').click();
    } else if (e.key === '2' || e.key === 'w') {
        document.getElementById('btn-wall').click();
    } else if (e.key === 'Enter' || e.key === ' ') {
        if (!document.getElementById('flood-alert').classList.contains('hidden')) {
            document.getElementById('flood-alert-ok').click();
        } else {
            endTurn();
        }
    }
});

// ===================== TURN LOGIC ============================

function endTurn() {
    // 1. Collect income
    const income = getIncome();
    state.money += income;

    // 2. Reset house building limit for next turn
    state.housesBuiltThisTurn = 0;

    // 3. Simulate flood
    simulateFlood();

    // 3. Show flood alert
    const alertEl = document.getElementById('flood-alert');
    const alertTitle = document.getElementById('flood-alert-title');
    const alertText = document.getElementById('flood-alert-text');

    if (state.lastFloodMag < 0.3) {
        alertTitle.textContent = '☀️ Calm Turn';
        alertText.textContent = `No significant flooding this turn.\nCollected £${income} income.`;
    } else {
        const severity = state.lastFloodMag >= 4 ? '🌊🌊 Major Flood!' :
                         state.lastFloodMag >= 2 ? '🌊 Flood!' : '💧 Minor Flood';
        alertTitle.textContent = severity;
        let msg = `Flood magnitude: ${state.lastFloodMag.toFixed(2)}m\nIncome collected: £${income}`;
        if (state.housesDestroyed > 0) {
            msg += `\n🏚️ ${state.housesDestroyed} house${state.housesDestroyed > 1 ? 's' : ''} destroyed!`;
        } else {
            msg += '\n✅ All houses survived!';
        }
        alertText.textContent = msg;
    }
    alertEl.classList.remove('hidden');

    state.turn++;
    updateHUD();
}

function checkGameOver() {
    if (state.money < 0) state.money = 0;
    if (state.money <= 0 && countHouses() === 0) {
        state.gameOver = true;
        document.getElementById('game-over-text').textContent =
            `You survived ${state.turn - 1} turns before running out of money and houses.`;
        document.getElementById('game-over').classList.remove('hidden');
    }
    updateHUD();
}

// ===================== GAME START ============================

function startGame() {
    initState();
    fitGumbel();
    createGrid();
    resizeCanvas();
    centerCamera();
    initClouds();
    updateHUD();

    document.getElementById('btn-house').classList.add('active');
    document.getElementById('btn-wall').classList.remove('active');
    state.tool = 'house';
}

window.addEventListener('resize', () => {
    resizeCanvas();
});

// Boot
startGame();
render();
