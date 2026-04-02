(function () {
    const API_BASE_URL = 'https://pokeapi.co/api/v2/pokemon';
    const PAGE_LIMIT = 60;
    const MAX_POKEMON_ID = 1025;
    let currentOffset = 0;
    const VIEW_LIST = 'list';
    const VIEW_DETAIL = 'detail';

    const pokemonInfoDiv = document.getElementById('pokemonInfo');
    const pokemonInput = document.getElementById('pokemonInput');
    const searchButton = document.getElementById('searchButton');

    function normalizePokemonName(name) {
        return name.trim().toLowerCase();
    }

    function formatPokemonId(id) {
        return `#${String(id).padStart(3, '0')}`;
    }

    function buildUrlFromState(state) {
        const url = new URL(window.location.href);
        url.searchParams.delete('offset');
        url.searchParams.delete('pokemon');

        if (state?.view === VIEW_DETAIL && state.pokemonName) {
            url.searchParams.set('pokemon', normalizePokemonName(state.pokemonName));
        } else {
            const safeOffset = Number.isFinite(state?.offset) ? Math.max(0, state.offset) : 0;
            if (safeOffset > 0) {
                url.searchParams.set('offset', String(safeOffset));
            }
        }

        return `${url.pathname}${url.search}${url.hash}`;
    }

    function writeHistoryState(state, replace = false) {
        const url = buildUrlFromState(state);
        if (replace) {
            window.history.replaceState(state, '', url);
            return;
        }
        window.history.pushState(state, '', url);
    }

    function getInitialStateFromUrl() {
        const url = new URL(window.location.href);
        const pokemonName = normalizePokemonName(url.searchParams.get('pokemon') || '');
        if (pokemonName) {
            return { view: VIEW_DETAIL, pokemonName };
        }

        const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
        const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
        return { view: VIEW_LIST, offset: safeOffset };
    }

    async function fetchPokemonData(pokemonName) {
        const response = await fetch(`${API_BASE_URL}/${normalizePokemonName(pokemonName)}`);
        if (!response.ok) {
            throw new Error('Pokemon not found');
        }
        return response.json();
    }

    async function fetchEvolutionChainData(pokemonData) {
        const speciesResponse = await fetch(pokemonData.species.url);
        if (!speciesResponse.ok) {
            throw new Error('Could not load Pokemon species data');
        }

        const speciesData = await speciesResponse.json();
        const chainUrl = speciesData.evolution_chain?.url;
        if (!chainUrl) {
            throw new Error('Evolution chain data not available');
        }

        const chainResponse = await fetch(chainUrl);
        if (!chainResponse.ok) {
            throw new Error('Could not load evolution chain data');
        }

        return chainResponse.json();
    }

    function flattenEvolutionChain(chainNode) {
        if (!chainNode) {
            return [];
        }

        const currentName = chainNode.species.name;
        const children = chainNode.evolves_to || [];

        if (children.length === 0) {
            return [currentName];
        }

        const childPaths = children.map((childNode) => flattenEvolutionChain(childNode).join(' -> '));
        return childPaths.map((path) => `${currentName} -> ${path}`);
    }

    async function renderEvolutionChain(pokemonData) {
        const evolutionChainDiv = document.getElementById('evolutionChain');
        if (!evolutionChainDiv) {
            return;
        }

        try {
            const evolutionChainData = await fetchEvolutionChainData(pokemonData);
            const evolutionPaths = flattenEvolutionChain(evolutionChainData.chain);

            evolutionChainDiv.innerHTML = `
                <p><strong>Evolution Chain:</strong></p>
                <ul class="chip-list">
                    ${evolutionPaths.map((path) => `<li>${path.toUpperCase()}</li>`).join('')}
                </ul>
            `;
        } catch (error) {
            console.error('Error fetching evolution chain data:', error);
            evolutionChainDiv.innerHTML = '<p><strong>Evolution Chain:</strong> Not available.</p>';
        }
    }

    function displayErrorMessage(message) {
        pokemonInfoDiv.innerHTML = `<p class="status-message status-error">${message}</p>`;
    }

    function displayLoadingState(label) {
        pokemonInfoDiv.innerHTML = `<p class="status-message status-loading">${label}</p>`;
    }

    function displayPokemonDetails(pokemonData) {
        pokemonInfoDiv.innerHTML = `
            <article class="details-card">
                <button id="backButton" class="ghost-button" type="button">Back to List</button>
                <p class="pokemon-id">${formatPokemonId(pokemonData.id)}</p>
                <h2 class="pokemon-name">${pokemonData.name.toUpperCase()}</h2>
                <img class="pokemon-sprite" src="${pokemonData.sprites.front_default}" alt="${pokemonData.name}">
                <div class="pokemon-meta">
                    <p><strong>Height:</strong> ${pokemonData.height}</p>
                    <p><strong>Weight:</strong> ${pokemonData.weight}</p>
                    <p><strong>Types:</strong> ${pokemonData.types.map((typeInfo) => typeInfo.type.name).join(', ')}</p>
                    <p><strong>Abilities:</strong> ${pokemonData.abilities.map((abilityInfo) => abilityInfo.ability.name).join(', ')}</p>
                </div>
                <h3>Stats</h3>
                <ul class="chip-list">
                    ${pokemonData.stats.map((statInfo) => `<li>${statInfo.stat.name}: ${statInfo.base_stat}</li>`).join('')}
                </ul>
                <h3>Moves</h3>
                <ul class="chip-list">
                    ${pokemonData.moves.slice(0, 15).map((moveInfo) => `<li>${moveInfo.move.name}</li>`).join('')}
                </ul>
                <div id="evolutionChain" class="evolution-chain">
                    <p><strong>Evolution Chain:</strong> Loading...</p>
                </div>
            </article>
        `;

        document.getElementById('backButton').addEventListener('click', () => {
            const state = window.history.state;
            if (state?.view === VIEW_DETAIL) {
                window.history.back();
                return;
            }

            showPokemonList(currentOffset, { updateHistory: true });
        });

        renderEvolutionChain(pokemonData);
    }

    async function showPokemonDetailsByName(pokemonName, options = {}) {
        const { updateHistory = true, replaceHistory = false } = options;

        try {
            displayLoadingState(`Loading ${pokemonName}...`);
            const pokemonData = await fetchPokemonData(pokemonName);
            displayPokemonDetails(pokemonData);

            if (updateHistory) {
                writeHistoryState(
                    { view: VIEW_DETAIL, pokemonName: normalizePokemonName(pokemonData.name) },
                    replaceHistory
                );
            }
        } catch (error) {
            console.error('Error displaying Pokemon data:', error);
            displayErrorMessage('Pokemon not found. Please try again.');
        }
    }

    async function fetchAndDisplayPokemonPage(offset) {
        try {
            displayLoadingState(`Loading Pokemon ${offset + 1}-${offset + PAGE_LIMIT}...`);

            const response = await fetch(`${API_BASE_URL}?limit=${PAGE_LIMIT}&offset=${offset}`);
            if (!response.ok) {
                throw new Error('Could not load Pokemon list');
            }

            const data = await response.json();
            const pokemonList = data.results;
            currentOffset = offset;
            const currentPage = Math.floor(currentOffset / PAGE_LIMIT) + 1;

            // Fetch all details in parallel so rendering is faster and stable.
            const pokemonDataList = await Promise.all(
                pokemonList.map((pokemon) => fetchPokemonData(pokemon.name))
            );

            pokemonInfoDiv.innerHTML = `
                <div id="pokemonGrid" class="pokemon-grid">
                    ${pokemonDataList.map((pokemonData) => `
                        <button
                            type="button"
                            class="pokemon-card"
                            data-pokemon-name="${pokemonData.name}"
                        >
                            <p class="card-id">${formatPokemonId(pokemonData.id)}</p>
                            <h3 class="card-title">${pokemonData.name.toUpperCase()}</h3>
                            <img class="card-sprite" src="${pokemonData.sprites.front_default}" alt="${pokemonData.name}">
                        </button>
                    `).join('')}
                </div>
                <div class="list-controls">
                    <button
                        id="prevButton"
                        class="list-nav-button"
                        type="button"
                        ${data.previous ? '' : 'disabled'}
                    >
                        Previous
                    </button>
                    <p class="page-indicator">Page ${currentPage}</p>
                    <button
                        id="nextButton"
                        class="list-nav-button"
                        type="button"
                        ${data.next ? '' : 'disabled'}
                    >
                        Next
                    </button>
                </div>
            `;
        } catch (error) {
            console.error('Error fetching initial Pokemon data:', error);
            displayErrorMessage('Could not load Pokemon. Please refresh and try again.');
        }
    }

    async function showPokemonList(offset, options = {}) {
        const { updateHistory = true, replaceHistory = false } = options;
        await fetchAndDisplayPokemonPage(offset);

        if (updateHistory) {
            writeHistoryState({ view: VIEW_LIST, offset: Math.max(0, offset) }, replaceHistory);
        }
    }

    async function handleSearch(event) {
        event.preventDefault();

        const pokemonName = normalizePokemonName(pokemonInput.value);
        if (!pokemonName) {
            displayErrorMessage('Enter a Pokemon name first.');
            return;
        }

        try {
            await showPokemonDetailsByName(pokemonName, { updateHistory: true });
        } catch (error) {
            console.error('Error displaying Pokemon data:', error);
            displayErrorMessage('Pokemon not found. Please try again.');
        }
    }

    searchButton.addEventListener('click', handleSearch);

    pokemonInfoDiv.addEventListener('click', async (event) => {
        const button = event.target.closest('.pokemon-card');
        if (button) {
            const pokemonName = button.dataset.pokemonName;
            if (!pokemonName) {
                return;
            }

            await showPokemonDetailsByName(pokemonName, { updateHistory: true });

            return;
        }

        const prevButton = event.target.closest('#prevButton');
        if (prevButton && !prevButton.disabled) {
            showPokemonList(Math.max(0, currentOffset - PAGE_LIMIT), { updateHistory: true });
            return;
        }

        const nextButton = event.target.closest('#nextButton');
        if (nextButton && !nextButton.disabled) {
            showPokemonList(currentOffset + PAGE_LIMIT, { updateHistory: true });
        }
    });

    window.addEventListener('popstate', (event) => {
        const state = event.state;
        if (!state || state.view === VIEW_LIST) {
            const offset = Number.isFinite(state?.offset) ? Math.max(0, state.offset) : 0;
            showPokemonList(offset, { updateHistory: false });
            return;
        }

        if (state.view === VIEW_DETAIL && state.pokemonName) {
            showPokemonDetailsByName(state.pokemonName, { updateHistory: false });
        }
    });

    const initialState = getInitialStateFromUrl();
    if (initialState.view === VIEW_DETAIL) {
        writeHistoryState(initialState, true);
        showPokemonDetailsByName(initialState.pokemonName, { updateHistory: false });
    } else {
        writeHistoryState(initialState, true);
        showPokemonList(initialState.offset, { updateHistory: false });
    }
})();