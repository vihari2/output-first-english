let blocoAtual = '';
let isRedirecting = false;
let authInitialized = false;
let sessaoFlashcards = null;

const SUPABASE_URL = 'https://cxwyrfngaslvehcodxij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NnWB7ZwtU-x4GMVwDLbVeA_mP2mIe99';

let supabaseClient = null;

function getSupabaseClient() {
    if (!supabaseClient && window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

function isSupabaseConfigured() {
    return !!(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'SUA_URL_DO_SUPABASE' && SUPABASE_ANON_KEY !== 'SUA_CHAVE_ANON');
}

function getCurrentUserId() {
    if (!isSupabaseConfigured()) return null;
    return localStorage.getItem('supabase_user_id');
}

function setAuthStatus(message, isError = false) {
    const status = document.getElementById('auth-status');
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? '#b91c1c' : '#475569';
}

async function ensureProfile(user) {
    if (!user || !isSupabaseConfigured()) return;

    const client = getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error(error);
        return;
    }

    if (!data) {
        const { error: insertError } = await client.from('profiles').insert([
            {
                user_id: user.id,
                nome: user.email?.split('@')[0] || 'User',
                avatar_url: null
            }
        ]);

        if (insertError) {
            console.error(insertError);
        }
    }
}

async function loadProfileFromSupabase() {
    const userId = getCurrentUserId();
    if (!userId || !isSupabaseConfigured()) return;

    const client = getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error(error);
        return;
    }

    const nomeTxt = document.getElementById('nome-txt');
    if (nomeTxt && data?.nome) {
        nomeTxt.textContent = data.nome;
        localStorage.setItem('nomeUsuario', data.nome);
    }

    if (data?.avatar_url && fotoImg) {
        fotoImg.src = data.avatar_url;
        localStorage.setItem('fotoPerfilCustom', data.avatar_url);
    }
}

// --- Inicialização (carregar background salvo) ---
window.onload = function() {
    aplicarBackgroundSalvo();
    // ... suas outras funções de init, se tiver ...
}

function aplicarBackgroundSalvo() {
    const tipoSalvo = localStorage.getItem('bg_type');
    const valorSalvo = localStorage.getItem('bg_value');
    
    if (tipoSalvo === 'image' && valorSalvo) {
        document.body.style.backgroundImage = `url(${valorSalvo})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
    } else {
        // Se for cor ou nada salvo, reseta para a cor padrão do body (a que vc usa na imagem 3)
        document.body.style.backgroundColor = '#F0F2F5'; 
        document.body.style.backgroundImage = 'none';
    }
}

// --- Interatividade ---
const btnConfig = document.getElementById('btn-config-bg');

if (btnConfig) {
    btnConfig.addEventListener('click', function() {
        const modal = document.getElementById('modal-config-bg');
        if (modal) {
            modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
        }
    });
}

function closeConfigModal() {
    document.getElementById('modal-config-bg').style.display = 'none';
}

function toggleBgOption(option) {
    const uploadContainer = document.getElementById('upload-container');
    if (option === 'image') {
        uploadContainer.style.display = 'block';
    } else {
        uploadContainer.style.display = 'none';
        // Remove a imagem e salva que é cor
        localStorage.removeItem('bg_value');
        localStorage.setItem('bg_type', 'color');
        aplicarBackgroundSalvo();
    }
}

// --- Mágica do Upload (Base64) ---
function handleImageUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Verificação simples de tamanho (ex: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("A imagem é muito grande. Máximo 5MB.");
            input.value = ""; // Limpa o input
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const base64Image = e.target.result;
            
            // Salva no localStorage
            localStorage.setItem('bg_type', 'image');
            localStorage.setItem('bg_value', base64Image);
            
            // Aplica imediatamente
            aplicarBackgroundSalvo();
        }
        
        reader.readAsDataURL(file); // Converte a imagem para Base64
    }
}

async function saveNameToSupabase() {
    const userId = getCurrentUserId();
    if (!userId || !isSupabaseConfigured()) return;

    const nomeTag = document.getElementById('nome-txt');
    const nome = nomeTag ? nomeTag.textContent.trim() || 'Your Name Here' : 'Your Name Here';
    localStorage.setItem('nomeUsuario', nome);

    const client = getSupabaseClient();
    const { error } = await client
        .from('profiles')
        .upsert({ user_id: userId, nome }, { onConflict: 'user_id' });

    if (error) {
        console.error(error);
    }
}

async function saveAvatarToSupabase(file) {
    const userId = getCurrentUserId();
    if (!userId || !isSupabaseConfigured() || !file) return;

    const fileName = `${userId}-${Date.now()}.png`;
    const client = getSupabaseClient();

    const { error: uploadError } = await client.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        console.error(uploadError);
        return;
    }

    const { data: publicUrlData } = client.storage
        .from('avatars')
        .getPublicUrl(fileName);

    const avatarUrl = publicUrlData?.publicUrl;

    if (avatarUrl) {
        const { error } = await client
            .from('profiles')
            .upsert({ user_id: userId, avatar_url: avatarUrl }, { onConflict: 'user_id' });

        if (error) {
            console.error(error);
        }
    }
}

async function signUpWithEmail() {
    const email = document.getElementById('email-input')?.value?.trim();
    const password = document.getElementById('password-input')?.value?.trim();

    if (!email || !password) {
        setAuthStatus('Please enter email and password.', true);
        return;
    }

    if (!isSupabaseConfigured()) {
        setAuthStatus('Configure Supabase to enable multi-user login.', true);
        return;
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
        setAuthStatus(error.message, true);
        return;
    }

    if (data?.user) {
        localStorage.setItem('supabase_user_id', data.user.id);
        await ensureProfile(data.user);
    }

    setAuthStatus('Account created. Check your email to confirm your registration, then sign in.');
}

async function signInWithEmail() {
    const email = document.getElementById('email-input')?.value?.trim();
    const password = document.getElementById('password-input')?.value?.trim();

    if (!email || !password) {
        setAuthStatus('Please enter email and password.', true);
        return;
    }

    if (!isSupabaseConfigured()) {
        setAuthStatus('Configure Supabase to enable multi-user login.', true);
        return;
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
        setAuthStatus(error.message, true);
        return;
    }

    if (data?.user) {
        localStorage.setItem('supabase_user_id', data.user.id);
        await ensureProfile(data.user);
        await loadProfileFromSupabase();
        setAuthStatus(`Connected as ${data.user.email}`);
        updateAuthUI();
        setTimeout(() => {
            isRedirecting = true;
            window.location.href = 'dashboard.html';
        }, 1500);
        return;
    }

    setAuthStatus('Could not sign in.', true);
}

async function signOut() {
    const client = getSupabaseClient();

    if (isSupabaseConfigured() && client?.auth) {
        await client.auth.signOut();
    }

    localStorage.removeItem('supabase_user_id');
    updateAuthUI();

    setTimeout(() => {
        isRedirecting = true;
        window.location.href = 'index.html';
    }, 300);
}

function updateAuthUI() {
    const logoutBtn = document.getElementById('auth-logout');
    const submitBtn = document.getElementById('auth-submit');
    const signupBtn = document.getElementById('auth-signup');

    if (!logoutBtn || !submitBtn || !signupBtn) return;

    const loggedIn = isSupabaseConfigured() && !!localStorage.getItem('supabase_user_id');
    logoutBtn.classList.toggle('hidden', !loggedIn);
    signupBtn.classList.toggle('hidden', loggedIn);
    submitBtn.textContent = 'Enter';
}

function initAuth() {
    // Evita executar mais de uma vez
    if (authInitialized) return;
    authInitialized = true;

    // Redirecionamento desabilitado temporariamente
    // if (isSupabaseConfigured() && localStorage.getItem('supabase_user_id') && !isRedirecting) {
    //     isRedirecting = true;
    //     window.location.href = 'index.html';
    //     return;
    // }

    const form = document.getElementById('auth-form');
    const signUpBtn = document.getElementById('auth-signup');
    const logoutBtn = document.getElementById('auth-logout');

    if (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            signInWithEmail();
        });
    }

    if (signUpBtn) {
        signUpBtn.addEventListener('click', signUpWithEmail);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }

    updateAuthUI();

    if (!isSupabaseConfigured()) {
        setAuthStatus('Configure Supabase to enable multi-user login.');
    }
}

window.signUpWithEmail = signUpWithEmail;
window.signInWithEmail = signInWithEmail;
window.signOut = signOut;

function hideDevBanner() {
    const banner = document.querySelector('.dev-banner');
    if (banner) {
        banner.classList.add('hidden');
    }
}

function showDevBanner() {
    const banner = document.querySelector('.dev-banner');
    if (banner) {
        banner.classList.remove('hidden');
    }
}

function abrirAnotacao(nomeBloco) {
    blocoAtual = nomeBloco;
    hideDevBanner();
    document.getElementById('modal-titulo').innerText = nomeBloco;

    const areaConteudo = document.getElementById('modal-conteudo');
    areaConteudo.innerHTML = '';

    if (nomeBloco === 'Flashcards') {
        renderizarTabelaFlashcards(areaConteudo);
    } else if (nomeBloco === 'Speaking Notes') {
        renderizarGoogleMeet(areaConteudo);
    } else if (nomeBloco === 'Other Resources') {
        renderizarOtherResources(areaConteudo);
    } else if (nomeBloco === 'Writing Journal') {
        renderizarWritingJournal(areaConteudo);
    } else if (nomeBloco === 'My Coursebook') {
        renderizarCoursebook(areaConteudo);
    } else {
        renderizarBlocoDeTexto(areaConteudo, nomeBloco);
    }

    document.getElementById('modal').style.display = 'flex';
}

function fecharModal() {
    if (blocoAtual === 'Google Meet') {
        const obsTexto = document.getElementById('obs-meet');
        if (obsTexto) {
            localStorage.setItem('obs_Google Meet', obsTexto.value);
        }
    } else if (blocoAtual !== 'Flashcards' && blocoAtual !== 'Other Resources' && blocoAtual !== 'Google Meet' && blocoAtual !== 'Writing Journal' && blocoAtual !== 'My Coursebook') {
        const campoTexto = document.getElementById('modal-texto');
        if (campoTexto) {
            localStorage.setItem('notas_' + blocoAtual, campoTexto.value);
        }
    }

    document.getElementById('modal').style.display = 'none';
    showDevBanner();
}

function salvarNome() {
    const nomeTag = document.getElementById('nome-txt');
    if (!nomeTag) return;
    const nome = nomeTag.textContent.trim() || 'Your Name Here';
    localStorage.setItem('nomeUsuario', nome);

    if (isSupabaseConfigured()) {
        saveNameToSupabase();
    }
}

// -- Bloco de Texto Genérico --
function renderizarBlocoDeTexto(container, nomeBloco) {
    const textoSalvo = localStorage.getItem('notas_' + nomeBloco) || '';
    container.innerHTML = `<textarea id="modal-texto" placeholder="Write your notes here...">${textoSalvo}</textarea>`;
}

// -- Flashcards --
function obterFlashcards() {
    try {
        return JSON.parse(localStorage.getItem('meusFlashcards')) || [];
    } catch (error) {
        return [];
    }
}

function escaparHtml(valor) {
    const elemento = document.createElement('div');
    elemento.textContent = valor || '';
    return elemento.innerHTML;
}

function obterBaralhoDoCard(card) {
    // "category" é usado como baralho para manter os cards criados na versão anterior.
    const baralho = card.deck || card.category || 'Default';
    return baralho === 'Padrão' ? 'Default' : baralho;
}

function obterFrenteDoCard(card) {
    return card.front || card.word || '';
}

function obterVersoDoCard(card) {
    return card.back || card.meaning || '';
}

function obterBaralhos() {
    const nomesDosCards = obterFlashcards().map(obterBaralhoDoCard);
    let baralhosSalvos = [];
    try {
        baralhosSalvos = JSON.parse(localStorage.getItem('meusBaralhos')) || [];
    } catch (error) {
        baralhosSalvos = [];
    }
    const baralhosEmIngles = baralhosSalvos.map((baralho) => baralho === 'Padrão' ? 'Default' : baralho);
    return [...new Set(['Default', ...baralhosEmIngles, ...nomesDosCards])];
}

function renderizarTabelaFlashcards(container) {
    container.innerHTML = `
        <div class="flashcards-header">
            <div class="flashcards-tabs" role="tablist" aria-label="Flashcard navigation">
                <button id="aba-baralhos" class="flashcards-tab ativo" type="button" onclick="mostrarBaralhos()">Decks</button>
                <button id="aba-adicionar" class="flashcards-tab" type="button" onclick="mostrarFormularioFlashcard()">Add</button>
            </div>
        </div>
        <div id="flashcards-area"></div>
    `;
    mostrarBaralhos();
}

function atualizarAbaFlashcards(abaAtiva) {
    document.querySelectorAll('.flashcards-tab').forEach((botao) => {
        const ativa = botao.id === `aba-${abaAtiva}`;
        botao.classList.toggle('ativo', ativa);
        botao.setAttribute('aria-selected', ativa);
    });
}

function mostrarBaralhos() {
    const area = document.getElementById('flashcards-area');
    if (!area) return;
    atualizarAbaFlashcards('baralhos');

    const cards = obterFlashcards();
    const baralhos = obterBaralhos();
    area.innerHTML = `
        <div class="baralhos-acoes">
            <button class="btn-criar-baralho" type="button" onclick="exibirCriacaoBaralho()">+ Create deck</button>
        </div>
        <form id="form-criar-baralho" class="form-criar-baralho oculto">
            <label for="nome-novo-baralho">Deck name</label>
            <div class="criar-baralho-controles">
                <input id="nome-novo-baralho" type="text" maxlength="60" placeholder="E.g.: Irregular verbs" required>
                <button type="submit">Create</button>
            </div>
            <p id="aviso-novo-baralho" class="flashcard-aviso" role="status" aria-live="polite"></p>
        </form>
        <section class="lista-baralhos" aria-label="Your decks">
            ${baralhos.map((baralho) => {
                const quantidade = cards.filter((card) => obterBaralhoDoCard(card) === baralho).length;
                return `<button class="baralho-item" type="button" data-baralho="${escaparHtml(baralho)}"><span class="baralho-nome">${escaparHtml(baralho)}</span><span class="baralho-contagem">${quantidade} ${quantidade === 1 ? 'card' : 'cards'}</span></button>`;
            }).join('')}
        </section>
    `;
    document.getElementById('form-criar-baralho').addEventListener('submit', criarBaralho);
    document.querySelectorAll('.baralho-item').forEach((botao) => {
        botao.addEventListener('click', () => abrirBaralho(botao.dataset.baralho));
    });
}

function exibirCriacaoBaralho() {
    const formulario = document.getElementById('form-criar-baralho');
    formulario.classList.remove('oculto');
    document.getElementById('nome-novo-baralho').focus();
}

function criarBaralho(evento) {
    evento.preventDefault();
    const campoNome = document.getElementById('nome-novo-baralho');
    const nome = campoNome.value.trim();
    const aviso = document.getElementById('aviso-novo-baralho');
    const baralhos = obterBaralhos();

    if (baralhos.some((baralho) => baralho.toLocaleLowerCase() === nome.toLocaleLowerCase())) {
        aviso.textContent = 'This deck already exists';
        return;
    }

    let baralhosSalvos = [];
    try {
        baralhosSalvos = JSON.parse(localStorage.getItem('meusBaralhos')) || [];
    } catch (error) {
        baralhosSalvos = [];
    }
    baralhosSalvos.push(nome);
    localStorage.setItem('meusBaralhos', JSON.stringify(baralhosSalvos));
    mostrarBaralhos();
}

function obterEstadoDoCard(card) {
    return ['new', 'learning', 'review'].includes(card.status) ? card.status : 'new';
}

function obterContagensDoBaralho(baralho) {
    return obterFlashcards()
        .filter((card) => obterBaralhoDoCard(card) === baralho)
        .reduce((contagens, card) => {
            contagens[obterEstadoDoCard(card)] += 1;
            return contagens;
        }, { new: 0, learning: 0, review: 0 });
}

function abrirBaralho(baralho) {
    const area = document.getElementById('flashcards-area');
    if (!area) return;
    atualizarAbaFlashcards('baralhos');
    const contagens = obterContagensDoBaralho(baralho);
    const total = contagens.new + contagens.learning + contagens.review;

    area.innerHTML = `
        <section class="visao-baralho">
            <button class="btn-voltar-baralhos" type="button" onclick="mostrarBaralhos()">← Decks</button>
            <h3>${escaparHtml(baralho)}</h3>
            <div class="contagens-estudo" aria-label="Cards para estudar">
                <div class="contador novo"><strong>${contagens.new}</strong><span>New</span></div>
                <div class="contador aprendizagem"><strong>${contagens.learning}</strong><span>Learning</span></div>
                <div class="contador revisar"><strong>${contagens.review}</strong><span>To Review</span></div>
            </div>
            <button id="btn-estudar-agora" class="btn-estudar-agora" type="button" ${total === 0 ? 'disabled' : ''}>Study now</button>
            ${total === 0 ? '<p class="estudo-vazio">Add cards to this deck to start studying.</p>' : ''}
        </section>
    `;
    document.getElementById('btn-estudar-agora').addEventListener('click', () => iniciarEstudo(baralho));
}

function iniciarEstudo(baralho) {
    const indices = obterFlashcards()
        .map((card, indice) => ({ card, indice }))
        .filter(({ card }) => obterBaralhoDoCard(card) === baralho && obterFrenteDoCard(card) && obterVersoDoCard(card))
        .map(({ indice }) => indice);

    sessaoFlashcards = { baralho, indices, posicao: 0, respostaVisivel: false };
    renderizarEstudoAtivo();
}

function renderizarEstudoAtivo() {
    const area = document.getElementById('flashcards-area');
    if (!area || !sessaoFlashcards) return;
    const { baralho, indices, posicao, respostaVisivel } = sessaoFlashcards;

    if (posicao >= indices.length) {
        const contagens = obterContagensDoBaralho(baralho);
        area.innerHTML = `
            <section class="fim-estudo">
                <h3>Session complete</h3>
                <p>You reviewed ${indices.length} ${indices.length === 1 ? 'card' : 'cards'} from ${escaparHtml(baralho)}.</p>
                <div class="contadores-compactos"><span class="novo">${contagens.new}</span> + <span class="aprendizagem">${contagens.learning}</span> + <span class="revisar">${contagens.review}</span></div>
                <button id="btn-voltar-ao-baralho" class="btn-estudar-agora" type="button">Back to deck</button>
            </section>
        `;
        document.getElementById('btn-voltar-ao-baralho').addEventListener('click', () => abrirBaralho(baralho));
        sessaoFlashcards = null;
        return;
    }

    const cards = obterFlashcards();
    const card = cards[indices[posicao]];
    const contagens = obterContagensDoBaralho(baralho);
    area.innerHTML = `
        <section class="tela-estudo" aria-label="Revisão de flashcard">
            <div class="estudo-topo"><span>${escaparHtml(baralho)}</span><span>${posicao + 1} / ${indices.length}</span></div>
            <div class="card-estudo">
                <p class="card-frente">${escaparHtml(obterFrenteDoCard(card))}</p>
                ${respostaVisivel ? `<div class="card-verso"><span>Back</span><p>${escaparHtml(obterVersoDoCard(card))}</p></div>` : ''}
            </div>
            <div class="contadores-compactos" aria-label="New, learning and to review"><span class="novo">${contagens.new}</span> + <span class="aprendizagem">${contagens.learning}</span> + <span class="revisar">${contagens.review}</span></div>
            ${respostaVisivel
                ? `<div class="avaliacao-card"><button type="button" class="btn-avaliacao novamente" onclick="avaliarCard('learning')">Again</button><button type="button" class="btn-avaliacao bom" onclick="avaliarCard('review')">Good</button></div>`
                : `<div class="acoes-estudo"><button type="button" class="btn-skip" onclick="pularCard()">Skip</button><button type="button" class="btn-mostrar-resposta" onclick="mostrarResposta()">Show Answer</button></div>`}
        </section>
    `;
}

function mostrarResposta() {
    if (!sessaoFlashcards) return;
    sessaoFlashcards.respostaVisivel = true;
    renderizarEstudoAtivo();
}

function pularCard() {
    if (!sessaoFlashcards) return;
    sessaoFlashcards.posicao += 1;
    sessaoFlashcards.respostaVisivel = false;
    renderizarEstudoAtivo();
}

function avaliarCard(status) {
    if (!sessaoFlashcards) return;
    const indice = sessaoFlashcards.indices[sessaoFlashcards.posicao];
    const cards = obterFlashcards();
    cards[indice].status = status;
    localStorage.setItem('meusFlashcards', JSON.stringify(cards));
    pularCard();
}

function mostrarFormularioFlashcard() {
    const area = document.getElementById('flashcards-area');
    if (!area) return;
    atualizarAbaFlashcards('adicionar');

    const opcoesBaralho = obterBaralhos()
        .map((baralho) => `<option value="${escaparHtml(baralho)}">${escaparHtml(baralho)}</option>`)
        .join('');
    area.innerHTML = `
        <form id="form-adicionar-flashcard" class="form-flashcard">
            <label for="flashcard-baralho">Deck</label>
            <select id="flashcard-baralho" required>${opcoesBaralho}</select>

            <label for="flashcard-frente">Front</label>
            <textarea id="flashcard-frente" rows="4" placeholder="Write the question or word" required></textarea>

            <label for="flashcard-verso">Back</label>
            <textarea id="flashcard-verso" rows="4" placeholder="Write the answer or meaning" required></textarea>

            <p id="flashcard-aviso" class="flashcard-aviso" role="status" aria-live="polite"></p>
            <div class="flashcard-acoes">
                <button class="btn-salvar-flashcard" type="submit">Add</button>
                <button class="btn-cancelar-flashcard" type="button" onclick="fecharModal()">Close</button>
            </div>
        </form>
    `;

    document.getElementById('form-adicionar-flashcard').addEventListener('submit', adicionarFlashcard);
    document.getElementById('flashcard-frente').focus();
}

function adicionarFlashcard(evento) {
    evento.preventDefault();
    const baralho = document.getElementById('flashcard-baralho').value.trim();
    const frente = document.getElementById('flashcard-frente').value.trim();
    const verso = document.getElementById('flashcard-verso').value.trim();
    const aviso = document.getElementById('flashcard-aviso');

    if (!baralho || !frente || !verso) return;

    const flashcards = obterFlashcards();
    // Os campos antigos também são gravados para preservar a compatibilidade da base local.
    flashcards.push({ deck: baralho, front: frente, back: verso, category: baralho, word: frente, meaning: verso, status: 'new' });
    localStorage.setItem('meusFlashcards', JSON.stringify(flashcards));

    document.getElementById('flashcard-frente').value = '';
    document.getElementById('flashcard-verso').value = '';
    aviso.textContent = 'Card added';
    document.getElementById('flashcard-frente').focus();
}

// -- Other Resources --
function renderizarOtherResources(container) {
    container.innerHTML = `
        <div style="max-height: 450px; overflow-y: auto; padding-right: 10px; font-size: 0.9em;">
            <h3 style="color: #1a73e8; margin-top: 0;">🌐 Online Tools & Utilities</h3>
             
              <table class="tabela-meet" style="margin-bottom: 20px;">
                    <tr><th>Resource</th><th>Purpose</th></tr>
                    <tr>
                        <td><b><a href="https://translate.google.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Google Translate</a> / <a href="https://reverso.net" target="_blank" style="color: #1a73e8; text-decoration: none;">Reverso</a></b></td>
                        <td>Quick reverse-translation & synonyms.</td>
                    </tr>
                    <tr>
                        <td><b><a href="https://www.efset.org" target="_blank" style="color: #1a73e8; text-decoration: none;">EF SET</a></b></td>
                        <td>Free 50-minute level assessment exam.</td>
                    </tr>
                    <tr>
                        <td><b><a href="https://youglish.com" target="_blank" style="color: #1a73e8; text-decoration: none;">YouGlish</a></b></td>
                        <td>Hear real native pronunciation via YouTube.</td>
                    </tr>
                </table>
            <h3 style="color: #1a73e8;">📖 English Books by CEFR Level</h3>
            <table class="tabela-meet" style="margin-bottom: 20px;">
                <tr><th>Level</th><th>Title</th></tr>
                <tr><td><b>A1</b></td><td>The Very Hungry Caterpillar, The Cat in the Hat, Charlotte's Web</td></tr>
                <tr><td><b>A2</b></td><td>Charlie and the Chocolate Factory, Matilda, The Giver</td></tr>
                <tr><td><b>B1</b></td><td>The Hunger Games, To Kill a Mockingbird, Harry Potter</td></tr>
                <tr><td><b>B2</b></td><td>The Hobbit, 1984, The Alchemist, Fahrenheit 451</td></tr>
                <tr><td><b>C1</b></td><td>Pride and Prejudice, Game of Thrones, Jane Eyre</td></tr>
                <tr><td><b>C2</b></td><td>Lolita, The Handmaid's Tale, Little Women</td></tr>
            </table>
        </div>
    `;
}

// -- Google Meet --
function renderizarGoogleMeet(container) {
    container.innerHTML = `
        <div style="max-height: 500px; overflow-y: auto; padding-right: 5px;">
            <h4 style="margin: 0 0 10px 0; color: #555;">Meet Sessions</h4>
            <button class="btn-adicionar-linha" onclick="adicionarLinhaMeet()">+ New Session</button>
            <table class="tabela-meet" style="margin-bottom: 20px;">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Topic</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="corpo-tabela-meet">
                </tbody>
            </table>

            <hr style="border: none; border-top: 2px solid #eaeaea; margin: 25px 0 20px 0;">

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0; color: #555;">Observation Journal</h4>
                <button class="btn-adicionar-linha" onclick="adicionarNotaMeet()" style="margin: 0;">+ New Note</button>
            </div>
            
            <table class="tabela-meet">
                <thead>
                    <tr>
                        <th style="width: 25%;">Date</th>
                        <th>Observation / Note</th>
                        <th style="width: 10%;"></th>
                    </tr>
                </thead>
                <tbody id="corpo-tabela-notas-meet">
                </tbody>
            </table>
        </div>
    `;

    carregarMeetSalvos();
    carregarNotasMeetSalvas();
}

function carregarMeetSalvos() {
    const corpoTabela = document.getElementById('corpo-tabela-meet');
    if (!corpoTabela) return;
    let sessoes = JSON.parse(localStorage.getItem('meuMeet')) || [];

    corpoTabela.innerHTML = '';
    sessoes.forEach((item, index) => {
        corpoTabela.innerHTML += `
            <tr>
                <td><input type="text" class="input-meet" value="${item.name}" onchange="salvarEdicaoMeet(${index}, 'name', this.value)" placeholder="Session 1"></td>
                <td><input type="date" class="input-meet" value="${item.date}" onchange="salvarEdicaoMeet(${index}, 'date', this.value)"></td>
                <td>
                    <select class="input-meet" onchange="salvarEdicaoMeet(${index}, 'status', this.value)">
                        <option value="Not started" ${item.status === 'Not started' ? 'selected' : ''}>Not started</option>
                        <option value="In progress" ${item.status === 'In progress' ? 'selected' : ''}>In progress</option>
                        <option value="Done" ${item.status === 'Done' ? 'selected' : ''}>Done</option>
                    </select>
                </td>
                <td><input type="text" class="input-meet" value="${item.topic}" onchange="salvarEdicaoMeet(${index}, 'topic', this.value)" placeholder="Topic..."></td>
                <td><button class="btn-remover" onclick="removerMeet(${index})">X</button></td>
            </tr>
        `;
    });
}

function adicionarLinhaMeet() {
    let sessoes = JSON.parse(localStorage.getItem('meuMeet')) || [];
    sessoes.push({ name: '', date: '', status: 'Not started', topic: '' });
    localStorage.setItem('meuMeet', JSON.stringify(sessoes));
    carregarMeetSalvos();
}

function salvarEdicaoMeet(index, campo, novoValor) {
    let sessoes = JSON.parse(localStorage.getItem('meuMeet')) || [];
    sessoes[index][campo] = novoValor;
    localStorage.setItem('meuMeet', JSON.stringify(sessoes));
}

function removerMeet(index) {
    let sessoes = JSON.parse(localStorage.getItem('meuMeet')) || [];
    sessoes.splice(index, 1);
    localStorage.setItem('meuMeet', JSON.stringify(sessoes));
    carregarMeetSalvos();
}

function carregarNotasMeetSalvas() {
    const corpoTabelaNotas = document.getElementById('corpo-tabela-notas-meet');
    if (!corpoTabelaNotas) return;
    let notas = JSON.parse(localStorage.getItem('diarioNotasMeet')) || [];

    corpoTabelaNotas.innerHTML = '';
    notas.forEach((item, index) => {
        corpoTabelaNotas.innerHTML += `
            <tr>
                <td><input type="date" class="input-meet" value="${item.data}" onchange="salvarEdicaoNotaMeet(${index}, 'data', this.value)"></td>
                <td><textarea class="textarea-meet" onchange="salvarEdicaoNotaMeet(${index}, 'texto', this.value)" oninput="autoGrowTextarea(this)" placeholder="Write your observation here...">${item.texto}</textarea></td>
                <td><button class="btn-remover" onclick="removerNotaMeet(${index})">X</button></td>
            </tr>
        `;
    });
    // Trigger auto-grow for loaded textareas
    document.querySelectorAll('.textarea-meet').forEach(ta => autoGrowTextarea(ta));
}

function adicionarNotaMeet() {
    let notas = JSON.parse(localStorage.getItem('diarioNotasMeet')) || [];
    let dataHoje = new Date().toISOString().split('T')[0];
    notas.push({ data: dataHoje, texto: '' });
    localStorage.setItem('diarioNotasMeet', JSON.stringify(notas));
    carregarNotasMeetSalvas();
}

function salvarEdicaoNotaMeet(index, campo, novoValor) {
    let notas = JSON.parse(localStorage.getItem('diarioNotasMeet')) || [];
    notas[index][campo] = novoValor;
    localStorage.setItem('diarioNotasMeet', JSON.stringify(notas));
}

function removerNotaMeet(index) {
    let notas = JSON.parse(localStorage.getItem('diarioNotasMeet')) || [];
    notas.splice(index, 1);
    localStorage.setItem('diarioNotasMeet', JSON.stringify(notas));
    carregarNotasMeetSalvas();
}

function autoGrowTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
}

// -- Writing Journal --
function renderizarWritingJournal(container) {
    container.innerHTML = `
        <div style="max-height: 450px; overflow-y: auto; padding-right: 5px;">
            <button class="btn-adicionar-linha" onclick="adicionarRegistroJournal()">+ Add Day</button>
            <table class="tabela-meet" style="margin-top: 15px;">
                <thead>
                    <tr>
                        <th style="width: 40%;">Date</th>
                        <th>Wrote in the journal?</th>
                        <th style="width: 10%;"></th>
                    </tr>
                </thead>
                <tbody id="corpo-tabela-journal">
                </tbody>
            </table>
        </div>
    `;
    carregarJournalSalvo();
}

function carregarJournalSalvo() {
    const corpoTabela = document.getElementById('corpo-tabela-journal');
    if (!corpoTabela) return;
    let registros = JSON.parse(localStorage.getItem('meuWritingJournal')) || [];

    corpoTabela.innerHTML = '';
    registros.forEach((item, index) => {
        corpoTabela.innerHTML += `
            <tr>
                <td><input type="date" class="input-meet" value="${item.data}" onchange="salvarEdicaoJournal(${index}, 'data', this.value)"></td>
                <td>
                    <select class="input-meet" onchange="salvarEdicaoJournal(${index}, 'feito', this.value)">
                        <option value="Sim" ${item.feito === 'Sim' ? 'selected' : ''}>✅ Yes, I wrote</option>
                        <option value="Não" ${item.feito === 'Não' ? 'selected' : ''}>❌ No, I did not write</option>
                    </select>
                </td>
                <td><button class="btn-remover" onclick="removerJournal(${index})">X</button></td>
            </tr>
        `;
    });
}

function adicionarRegistroJournal() {
    let registros = JSON.parse(localStorage.getItem('meuWritingJournal')) || [];
    let dataHoje = new Date().toISOString().split('T')[0];
    registros.push({ data: dataHoje, feito: 'Sim' });
    localStorage.setItem('meuWritingJournal', JSON.stringify(registros));
    carregarJournalSalvo();
}

function salvarEdicaoJournal(index, campo, novoValor) {
    let registros = JSON.parse(localStorage.getItem('meuWritingJournal')) || [];
    registros[index][campo] = novoValor;
    localStorage.setItem('meuWritingJournal', JSON.stringify(registros));
}

function removerJournal(index) {
    let registros = JSON.parse(localStorage.getItem('meuWritingJournal')) || [];
    registros.splice(index, 1);
    localStorage.setItem('meuWritingJournal', JSON.stringify(registros));
    carregarJournalSalvo();
}

// -- My Coursebook --
function renderizarCoursebook(container) {
    container.innerHTML = `
        <div style="max-height: 450px; overflow-y: auto; padding-right: 5px;">
            <button class="btn-adicionar-linha" onclick="adicionarLivroCoursebook()">+ Add Book</button>
            <table class="tabela-meet" style="margin-top: 15px;">
                <thead>
                    <tr>
                        <th style="width: 40%;">Book Name</th>
                        <th style="width: 25%;">Page/Chapter</th>
                        <th style="width: 25%;">Date</th>
                        <th style="width: 10%;"></th>
                    </tr>
                </thead>
                <tbody id="corpo-tabela-coursebook">
                </tbody>
            </table>
        </div>
    `;
    carregarCoursebookSalvo();
}

function carregarCoursebookSalvo() {
    const corpoTabela = document.getElementById('corpo-tabela-coursebook');
    if (!corpoTabela) return;
    let livros = JSON.parse(localStorage.getItem('meuCoursebook')) || [];

    corpoTabela.innerHTML = '';
    livros.forEach((item, index) => {
        corpoTabela.innerHTML += `
            <tr>
                <td><input type="text" class="input-meet" value="${item.nome}" onchange="salvarEdicaoCoursebook(${index}, 'nome', this.value)" placeholder="Ex: English Grammar in Use"></td>
                <td><input type="text" class="input-meet" value="${item.parada}" onchange="salvarEdicaoCoursebook(${index}, 'parada', this.value)" placeholder="Ex: Cap. 4 / Pág. 45"></td>
                <td><input type="date" class="input-meet" value="${item.data}" onchange="salvarEdicaoCoursebook(${index}, 'data', this.value)"></td>
                <td><button class="btn-remover" onclick="removerCoursebook(${index})">X</button></td>
            </tr>
        `;
    });
}

function adicionarLivroCoursebook() {
    let livros = JSON.parse(localStorage.getItem('meuCoursebook')) || [];
    let dataHoje = new Date().toISOString().split('T')[0];
    livros.push({ nome: '', parada: '', data: dataHoje });
    localStorage.setItem('meuCoursebook', JSON.stringify(livros));
    carregarCoursebookSalvo();
}

function salvarEdicaoCoursebook(index, campo, novoValor) {
    let livros = JSON.parse(localStorage.getItem('meuCoursebook')) || [];
    livros[index][campo] = novoValor;
    localStorage.setItem('meuCoursebook', JSON.stringify(livros));
}

function removerCoursebook(index) {
    let livros = JSON.parse(localStorage.getItem('meuCoursebook')) || [];
    livros.splice(index, 1);
    localStorage.setItem('meuCoursebook', JSON.stringify(livros));
    carregarCoursebookSalvo();
}

// --- Lógica para salvar a foto do avatar ---
const fotoImg = document.getElementById('foto-img');
const uploadFoto = document.getElementById('upload-foto');

function loadProfileData() {
    const nomeSalvo = localStorage.getItem('nomeUsuario');
    const nomeTxt = document.getElementById('nome-txt');
    if (nomeTxt) {
        nomeTxt.textContent = nomeSalvo || 'Your Name Here';
    }

    const fotoSalva = localStorage.getItem('fotoPerfilCustom');
    if (fotoSalva && fotoImg) {
        fotoImg.src = fotoSalva;
    }

    const gatoSalvo = localStorage.getItem('fotoGatoCustom');
    if (gatoSalvo && imgGato) {
        imgGato.src = gatoSalvo;
    }
}

function redirectIfNeeded() {
    if (isRedirecting) return;

    const isLoginPage = window.location.pathname.endsWith('index.html');
    const isLoggedIn = !!localStorage.getItem('supabase_user_id');

    if (!isLoginPage && !isLoggedIn) {
        isRedirecting = true;
        window.location.href = 'index.html';
        return;
    }

    if (isLoginPage && isLoggedIn) {
        isRedirecting = true;
        window.location.href = 'dashboard.html';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initAuth();
});

window.addEventListener('load', () => {
    // redirectIfNeeded(); // DESABILITADO TEMPORARIAMENTE
    loadProfileData();
});

if (fotoImg && uploadFoto) {
    fotoImg.addEventListener('click', () => uploadFoto.click());

    uploadFoto.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const dataUrl = event.target.result;
            fotoImg.src = dataUrl;
            localStorage.setItem('fotoPerfilCustom', dataUrl);
        };
        reader.readAsDataURL(file);

        if (isSupabaseConfigured()) {
            await saveAvatarToSupabase(file);
        }
    });
}

// --- Lógica para salvar a foto do gatinho ---
const imgGato = document.getElementById('img-gato');
const uploadGato = document.getElementById('upload-gato');

if (imgGato && uploadGato) {
    imgGato.addEventListener('click', () => uploadGato.click());

    uploadGato.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                const dataUrl = event.target.result;
                imgGato.src = dataUrl;
                localStorage.setItem('fotoGatoCustom', dataUrl);
            };
            reader.readAsDataURL(file);
        }
    });
}

