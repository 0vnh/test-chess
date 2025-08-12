// Clean Chess implementation (click-to-move) with solid rules and UX
import { initEngine, setElo, setBotConfig, requestMoveIfNeeded, resetEngineGame } from './engine/stockfish.js';
// Board uses FEN-like chars: uppercase = White, lowercase = Black, '.' empty

const START = [
  'rnbqkbnr',
  'pppppppp',
  '........',
  '........',
  '........',
  '........',
  'PPPPPPPP',
  'RNBQKBNR'
];

let board = START.map(row => row.split(''));
let whiteToMove = true;
let selected = null; // [r,c]
let highlighted = []; // list of [r,c]
let enPassant = null; // [r,c] target square if available
let gameOver = false;
let checkState = { whiteInCheck: false, blackInCheck: false };

// Castling rights
let castle = { wK: true, wQ: true, bK: true, bQ: true };

// Blitz clocks (3 minutes each)
let whiteTime = 180; // seconds
let blackTime = 180; // seconds
let timerId = null;
let started = false;

const boardEl = document.getElementById('chessBoard');
const statusEl = document.querySelector('.status');
const resetBtn = document.getElementById('resetGame');
const whiteClockEl = document.getElementById('whiteClock');
const blackClockEl = document.getElementById('blackClock');
const promoModal = document.getElementById('promotionModal');
let promotionPending = null; // {sr,sc,tr,tc, white}
// New controls and panels
const clearArrowsBtn = document.getElementById('clearArrows');
const darkToggle = document.getElementById('darkModeToggle');
const moveListEl = document.getElementById('moveList');
const playerRowWhite = document.querySelector('.player-row.white');
const playerRowBlack = document.querySelector('.player-row.black');
// Bot controls
const modeSelect = document.getElementById('modeSelect');
const botLevelSelect = document.getElementById('botLevelSelect');

// Engine (Stockfish) config/state (handled by engine module)
let engineInited = false;
let botEnabled = false;
let botPlaysWhite = false; // default from UI
let botElo = 1200;

// Arrow drawing
const arrowCanvas = document.getElementById('arrowCanvas');
let arrows = []; // {from:[r,c], to:[r,c], color}
let arrowStart = null; // [r,c] right-click start

// Premove
let premove = null; // {from:[r,c], to:[r,c], white}
let dragFrom = null; // for drag-and-drop

// Move history and highlights
let lastMove = null; // {from:[r,c], to:[r,c]}
let pendingJustMoved = null; // {from,to,piece,capture,promo,castle?,pieceClass?}
let moveHistory = []; // [{num,color,text,from,to,san,pieceClass}]
let plyCount = 0;

function isInside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function isWhite(ch){return ch && ch !== '.' && ch === ch.toUpperCase();}
function isBlack(ch){return ch && ch !== '.' && ch === ch.toLowerCase();}

function render(){
  boardEl.innerHTML = '';
  boardEl.style.display = 'grid';
  boardEl.style.gridTemplateColumns = 'repeat(8, 1fr)';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq = document.createElement('div');
      sq.className = 'square ' + (((r+c)%2===0)?'light':'dark');
      sq.dataset.r = r; sq.dataset.c = c;
      if(selected && selected[0]===r && selected[1]===c) sq.classList.add('selected');
      if(highlighted.some(([hr,hc])=>hr===r&&hc===c)) sq.classList.add('possible-move');
      if(premove && premove.from[0]===r && premove.from[1]===c) sq.classList.add('premove-from');
      if(premove && premove.to[0]===r && premove.to[1]===c) sq.classList.add('premove-to');
      const ch = board[r][c];
      if(ch !== '.'){
        const pe = document.createElement('div');
        const color = isWhite(ch) ? 'w' : 'b';
        const type = ch.toUpperCase();
        pe.className = `piece ${color}${type}`;
        // drag and drop: always draggable so premove via drag is possible
        pe.setAttribute('draggable','true');
        pe.addEventListener('dragstart', (e)=>onDragStart(e,r,c));
        sq.appendChild(pe);
      }
      // last move highlights
      if(lastMove){
        if(lastMove.from[0]===r && lastMove.from[1]===c) sq.classList.add('last-move-from');
        if(lastMove.to[0]===r && lastMove.to[1]===c) sq.classList.add('last-move-to');
      }
      sq.addEventListener('click', onSquareClick);
      // enable drop targets
      sq.addEventListener('dragover', (e)=>e.preventDefault());
      sq.addEventListener('drop', (e)=>onDrop(e,r,c));
      boardEl.appendChild(sq);
    }
  }
  updateStatus();
  updateClocksUI();
  sizeCanvas();
  drawArrows();
  renderMoveList();
  updateActivePlayerUI();
  // Do not start the timer automatically here; it will start after the first move
}

function updateStatus(){
  if(gameOver) return;
  const side = whiteToMove? 'White':'Black';
  if((whiteToMove && checkState.whiteInCheck) || (!whiteToMove && checkState.blackInCheck)){
    statusEl.textContent = `${side} to move • Check`;
  } else {
    statusEl.textContent = `${side} to move`;
  }
}

function onSquareClick(e){
  if(gameOver || promotionPending) return;
  const sq = e.currentTarget;
  const r = +sq.dataset.r, c = +sq.dataset.c;
  const ch = board[r][c];
  if(!selected){
    if(ch==='.') return; // empty
    // Allow selecting any piece: if it's your turn, show legal moves; otherwise prepare for premove
    selected = [r,c];
    if((whiteToMove && isWhite(ch)) || (!whiteToMove && isBlack(ch))) {
      highlightMoves(selected);
    } else {
      highlighted = [];
    }
    render();
  } else {
    const [sr,sc]=selected;
    if(sr===r && sc===c){ selected=null; render(); return; }
    const moves = legalMoves(sr,sc);
    if(moves.some(([mr,mc])=>mr===r&&mc===c)){
      const moving = board[sr][sc];
      const movingWhite = isWhite(moving);
      const isMyTurnNow = (whiteToMove && movingWhite) || (!whiteToMove && !movingWhite);
      if(isMyTurnNow){
        const isPromo = (moving==='P' && r===0) || (moving==='p' && r===7);
        if(isPromo){
          // open promotion UI and defer completing the move
          openPromotion(isWhite(moving), {sr,sc,tr:r,tc:c});
        } else {
          move(sr,sc,r,c);
          selected = null;
          highlighted = [];
          postMoveUpdate();
        }
      } else {
        // Not your turn: store/overwrite single premove
        setPremove([sr,sc],[r,c]);
        selected = null; highlighted = []; render();
      }
    } else {
      // allow reselect own piece
      if((whiteToMove && isWhite(ch)) || (!whiteToMove && isBlack(ch))){
        selected=[r,c];
        highlightMoves(selected);
        render();
      } else {
        // Set premove if selected piece is NOT of the side to move (i.e., it's your premove color)
        const selPiece = board[sr][sc];
        const selWhite = isWhite(selPiece);
        if(selPiece !== '.' && selWhite !== whiteToMove){
          setPremove([sr,sc],[r,c]);
          selected = null; highlighted = []; render();
        }
      }
    }
  }
}

// Drag and drop handlers
function onDragStart(e,r,c){
  if(gameOver || promotionPending) { e.preventDefault(); return; }
  const ch = board[r][c];
  if(!ch) return;
  if(!((whiteToMove && isWhite(ch)) || (!whiteToMove && isBlack(ch)))){ // not your turn => premove
    dragFrom = [r,c];
    // mark as premove source
    return;
  }
  dragFrom = [r,c];
}

function onDrop(e,r,c){
  e.preventDefault();
  if(!dragFrom) return;
  const [sr,sc]=dragFrom; dragFrom=null;
  if(gameOver || promotionPending) return;
  const moves = legalMoves(sr,sc);
  if(moves.some(([mr,mc])=>mr===r&&mc===c)){
    const moving = board[sr][sc];
    const movingWhite = isWhite(moving);
    const isMyTurnNow = (whiteToMove && movingWhite) || (!whiteToMove && !movingWhite);
    if(isMyTurnNow){
      const isPromo = (moving==='P' && r===0) || (moving==='p' && r===7);
      if(isPromo){
        openPromotion(isWhite(moving), {sr,sc,tr:r,tc:c});
      } else {
        move(sr,sc,r,c);
        selected = null; highlighted = [];
        postMoveUpdate();
      }
    } else {
      // Not your turn: store/overwrite single premove
      setPremove([sr,sc],[r,c]);
    }
  } else {
    // Not legal now: if not your turn, treat as premove attempt
    const moving = board[sr][sc];
    const movingWhite = isWhite(moving);
    const isMyTurnNow = (whiteToMove && movingWhite) || (!whiteToMove && !movingWhite);
    if(!isMyTurnNow){
      setPremove([sr,sc],[r,c]);
    }
  }
}

function move(sr,sc,tr,tc){
  const piece = board[sr][sc];
  const white = isWhite(piece);
  const dir = white? -1: 1;
  let capture = board[tr][tc] !== '.';

  // En passant capture
  if(piece.toLowerCase()==='p' && sc!==tc && board[tr][tc]==='.' && enPassant && tr===enPassant[0] && tc===enPassant[1]){
    board[tr - dir][tc] = '.'; // remove the pawn that was passed
    capture = true;
  }

  // Castling move (king two squares)
  if(piece.toLowerCase()==='k' && Math.abs(tc - sc)===2){
    // King side
    if(tc===6 && white){ board[tr][tc] = piece; board[sr][sc] = '.'; board[7][5] = board[7][7]; board[7][7] = '.'; }
    else if(tc===2 && white){ board[tr][tc] = piece; board[sr][sc]='.'; board[7][3]=board[7][0]; board[7][0]='.'; }
    else if(tc===6 && !white){ board[tr][tc] = piece; board[sr][sc]='.'; board[0][5]=board[0][7]; board[0][7]='.'; }
    else if(tc===2 && !white){ board[tr][tc] = piece; board[sr][sc]='.'; board[0][3]=board[0][0]; board[0][0]='.'; }
  } else {
    board[tr][tc] = piece;
    board[sr][sc] = '.';
  }

  // Promotion (auto-queen)
  if(piece==='P' && tr===0) board[tr][tc]='Q';
  if(piece==='p' && tr===7) board[tr][tc]='q';

  // Set/clear en passant
  enPassant = null;
  if(piece.toLowerCase()==='p' && Math.abs(tr - sr)===2){
    enPassant = [sr + dir, sc];
  }

  // Update castling rights
  if(piece==='K'){ castle.wK=false; castle.wQ=false; }
  if(piece==='k'){ castle.bK=false; castle.bQ=false; }
  if(piece==='R' && sr===7 && sc===0) castle.wQ=false;
  if(piece==='R' && sr===7 && sc===7) castle.wK=false;
  if(piece==='r' && sr===0 && sc===0) castle.bQ=false;
  if(piece==='r' && sr===0 && sc===7) castle.bK=false;
  // If a rook was captured, update rights as well
  if(tr===7 && tc===0 && board[tr][tc]!=='R') castle.wQ=false;
  if(tr===7 && tc===7 && board[tr][tc]!=='R') castle.wK=false;
  if(tr===0 && tc===0 && board[tr][tc]!=='r') castle.bQ=false;
  if(tr===0 && tc===7 && board[tr][tc]!=='r') castle.bK=false;

  // track last move and pending notation
  lastMove = { from:[sr,sc], to:[tr,tc] };
  const isCastle = piece.toUpperCase()==='K' && Math.abs(tc-sc)===2 ? (tc>sc? 'K' : 'Q') : null;
  const colorCode = isWhite(piece)? 'w' : 'b';
  const promoType = (piece==='P'&&tr===0)?'Q': (piece==='p'&&tr===7)?'q': null;
  const pieceTypeAfter = promoType ? promoType.toUpperCase() : piece.toUpperCase();
  pendingJustMoved = { from:[sr,sc], to:[tr,tc], piece, capture, promo: promoType, castle: isCastle, pieceClass: `${colorCode}${pieceTypeAfter}` };
}

function highlightMoves([r,c]){
  highlighted = legalMoves(r,c);
}

function pathClear(sr,sc,tr,tc){
  const dr = Math.sign(tr-sr);
  const dc = Math.sign(tc-sc);
  let r = sr+dr, c = sc+dc;
  while(r!==tr || c!==tc){
    if(board[r][c] !== '.') return false;
    r+=dr; c+=dc;
  }
  return true;
}

function legalMoves(r,c){
  const ch = board[r][c];
  const moves=[];
  if(ch==='.') return moves;
  const white = isWhite(ch);
  const dir = white? -1: 1; // pawns

  const add = (tr,tc)=>{
    if(!isInside(tr,tc)) return;
    const target = board[tr][tc];
    if(target==='.' || (white? isBlack(target): isWhite(target))) moves.push([tr,tc]);
  };

  // Pseudo-legal moves (no self-check filter yet)
  switch(ch.toLowerCase()){
    case 'p':{
      // forward
      const fr = r+dir;
      if(isInside(fr,c) && board[fr][c]==='.'){
        add(fr,c);
        const startRow = white? 6:1;
        const fr2 = r+2*dir;
        if(r===startRow && board[fr2][c]==='.') add(fr2,c);
      }
      // captures
      for(const dc of [-1,1]){
        const tr=r+dir, tc=c+dc;
        if(isInside(tr,tc)){
          const t = board[tr][tc];
          if(t!=='.' && (white? isBlack(t): isWhite(t))) add(tr,tc);
          // en passant capture into empty square
          if(t==='.' && enPassant && tr===enPassant[0] && tc===enPassant[1]) add(tr,tc);
        }
      }
      break;
    }
    case 'n':{
      const deltas = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
      for(const [dr,dc] of deltas){ add(r+dr,c+dc); }
      break;
    }
    case 'b':{
      for(const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        let tr=r+dr, tc=c+dc;
        while(isInside(tr,tc)){
          if(board[tr][tc]==='.') moves.push([tr,tc]);
          else { if(white? isBlack(board[tr][tc]): isWhite(board[tr][tc])) moves.push([tr,tc]); break; }
          tr+=dr; tc+=dc;
        }
      }
      break;
    }
    case 'r':{
      for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        let tr=r+dr, tc=c+dc;
        while(isInside(tr,tc)){
          if(board[tr][tc]==='.') moves.push([tr,tc]);
          else { if(white? isBlack(board[tr][tc]): isWhite(board[tr][tc])) moves.push([tr,tc]); break; }
          tr+=dr; tc+=dc;
        }
      }
      break;
    }
    case 'q':{
      return filterSelfCheckMoves(r,c,[...legalMovesFor('r',r,c,white), ...legalMovesFor('b',r,c,white)]);
    }
    case 'k':{
      for(let dr=-1;dr<=1;dr++){
        for(let dc=-1;dc<=1;dc++){
          if(dr===0&&dc===0) continue; add(r+dr,c+dc);
        }
      }
      // Castling: squares must be empty and not attacked, and rights available
      if(white){
        // For white, ensure squares are not attacked BY BLACK (byWhite = false)
        if(castle.wK && board[7][5]==='.' && board[7][6]==='.' && !isSquareAttacked(7,4,false,true) && !isSquareAttacked(7,5,false,true) && !isSquareAttacked(7,6,false,true)){
          moves.push([7,6]);
        }
        if(castle.wQ && board[7][1]==='.' && board[7][2]==='.' && board[7][3]==='.' && !isSquareAttacked(7,4,false,true) && !isSquareAttacked(7,3,false,true) && !isSquareAttacked(7,2,false,true)){
          moves.push([7,2]);
        }
      } else {
        // For black, ensure squares are not attacked BY WHITE (byWhite = true)
        if(castle.bK && board[0][5]==='.' && board[0][6]==='.' && !isSquareAttacked(0,4,true,false) && !isSquareAttacked(0,5,true,false) && !isSquareAttacked(0,6,true,false)){
          moves.push([0,6]);
        }
        if(castle.bQ && board[0][1]==='.' && board[0][2]==='.' && board[0][3]==='.' && !isSquareAttacked(0,4,true,false) && !isSquareAttacked(0,3,true,false) && !isSquareAttacked(0,2,true,false)){
          moves.push([0,2]);
        }
      }
      break;
    }
  }
  return filterSelfCheckMoves(r,c,moves);
}

function legalMovesFor(kind,r,c,white){
  const moves=[];
  const push=(tr,tc)=>{
    if(!isInside(tr,tc)) return;
    if(!isInside(tr,tc)) return false;
    const t=board[tr][tc];
    if(t==='.') { moves.push([tr,tc]); return true; }
    if(white? isBlack(t): isWhite(t)) moves.push([tr,tc]);
    return false;
  };
  const dirs = kind==='r'? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1]];
  for(const [dr,dc] of dirs){
    let tr=r+dr, tc=c+dc;
    while(isInside(tr,tc)){
      if(!push(tr,tc)) break;
      tr+=dr; tc+=dc;
    }
  }
  return moves;
}

resetBtn.addEventListener('click', ()=>{
  resetGame();
});

function resetGame(){
  board = START.map(row => row.split(''));
  whiteToMove = true; selected=null; highlighted=[];
  enPassant = null; gameOver = false;
  checkState = { whiteInCheck:false, blackInCheck:false };
  castle = { wK:true, wQ:true, bK:true, bQ:true };
  stopTimer(); whiteTime = 180; blackTime = 180; started=false; updateClocksUI();
  closePromotion(); promotionPending = null;
  premove = null; arrows = []; drawArrows();
  lastMove = null; pendingJustMoved = null; moveHistory = []; plyCount = 0; renderMoveList();
  updateActivePlayerUI();
  render();
  // Engine new game and immediate move if bot to play
  if(botEnabled){ ensureEngineInit(); resetEngineGame(); }
  triggerBotMoveIfNeeded();
}

function updateActivePlayerUI(){
  try{
    if(playerRowWhite && playerRowBlack){
      if(whiteToMove){
        playerRowWhite.classList.add('active');
        playerRowBlack.classList.remove('active');
      } else {
        playerRowBlack.classList.add('active');
        playerRowWhite.classList.remove('active');
      }
    }
  }catch(_){/* noop */}
}

render();

// Clock helpers
function startTimer(){
  stopTimer();
  timerId = setInterval(()=>{
    if(gameOver) { stopTimer(); return; }
    if(whiteToMove){
      whiteTime = Math.max(0, whiteTime - 1);
      if(whiteTime===0){ onFlag('Black'); }
    } else {
      blackTime = Math.max(0, blackTime - 1);
      if(blackTime===0){ onFlag('White'); }
    }
    updateClocksUI();
  }, 1000);
}

function switchTimer(){
  // timer keeps running, just update active class
  updateClocksUI();
}

function stopTimer(){
  if(timerId){ clearInterval(timerId); timerId=null; }
}

function onFlag(winner){
  gameOver = true;
  statusEl.textContent = `${winner} wins on time`;
  stopTimer();
}

function mmss(s){
  const m = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s%60).toString().padStart(2,'0');
  return `${m}:${ss}`;
}

function updateClocksUI(){
  if(whiteClockEl) whiteClockEl.textContent = mmss(whiteTime);
  if(blackClockEl) blackClockEl.textContent = mmss(blackTime);
  if(whiteClockEl && blackClockEl){
    if(whiteToMove){
      whiteClockEl.classList.add('active');
      blackClockEl.classList.remove('active');
    } else {
      blackClockEl.classList.add('active');
      whiteClockEl.classList.remove('active');
    }
  }
}

// --- Promotion UI ---
function openPromotion(white, moveInfo){
  promotionPending = { ...moveInfo, white };
  if(!promoModal) return;
  // set piece icons
  const opts = promoModal.querySelectorAll('.promotion-option');
  opts.forEach(btn => {
    const type = btn.dataset.piece; // Q R B N
    const pieceDiv = btn.querySelector('.piece');
    if(pieceDiv){ pieceDiv.className = `piece ${white? 'w':'b'}${type}`; }
    btn.onclick = () => finishPromotion(type);
  });
  promoModal.classList.remove('hidden');
}

function closePromotion(){
  if(!promoModal) return;
  promoModal.classList.add('hidden');
}

function finishPromotion(type){
  if(!promotionPending) return;
  const {sr,sc,tr,tc,white} = promotionPending;
  // Execute move similar to move(), but set promoted piece to selected type
  // Handle en passant capture if applicable
  const moving = board[sr][sc];
  const dir = white? -1: 1;
  let capture = board[tr][tc] !== '.';
  if(moving.toLowerCase()==='p' && sc!==tc && board[tr][tc]==='.' && enPassant && tr===enPassant[0] && tc===enPassant[1]){
    board[tr - dir][tc] = '.';
    capture = true;
  }
  // Handle castling not applicable for pawn
  board[tr][tc] = white ? type : type.toLowerCase();
  board[sr][sc] = '.';
  // Clear en passant (set if double push; not relevant as pawn reached last rank)
  enPassant = null;
  // Update castling rights if rook captured on rook squares
  if(tr===7 && tc===0 && board[tr][tc]!=='R') castle.wQ=false;
  if(tr===7 && tc===7 && board[tr][tc]!=='R') castle.wK=false;
  if(tr===0 && tc===0 && board[tr][tc]!=='r') castle.bQ=false;
  if(tr===0 && tc===7 && board[tr][tc]!=='r') castle.bK=false;

  // Clear UI state and continue
  selected = null; highlighted = [];
  closePromotion();
  promotionPending = null;
  lastMove = { from:[sr,sc], to:[tr,tc] };
  const colorCode = white? 'w' : 'b';
  pendingJustMoved = { from:[sr,sc], to:[tr,tc], piece: moving, capture, promo: white? type : type.toLowerCase(), castle: null, pieceClass: `${colorCode}${type}` };
  postMoveUpdate();
}

// --- Premoves ---
function setPremove(from,to){
  const p = board[from[0]][from[1]];
  if(p==='.') return;
  const meWhite = isWhite(p);
  // only allow setting premove if it's opponent's turn
  if((meWhite && whiteToMove) || (!meWhite && !whiteToMove)) return;
  premove = { from:[...from], to:[...to], white: meWhite };
  render();
}

function clearPremove(){ premove=null; render(); }

function tryApplyPremove(){
  if(!premove) return false;
  const myTurnNow = (whiteToMove && premove.white) || (!whiteToMove && !premove.white);
  if(!myTurnNow) return false;
  const [sr,sc] = premove.from; const [tr,tc] = premove.to;
  if(board[sr][sc]==='.' || isWhite(board[sr][sc])!==premove.white){ clearPremove(); return false; }
  const moves = legalMoves(sr,sc);
  if(moves.some(([mr,mc])=>mr===tr&&mc===tc)){
    const moving = board[sr][sc];
    const isPromo = (moving==='P' && tr===0) || (moving==='p' && tr===7);
    if(isPromo){
      openPromotion(isWhite(moving), {sr,sc,tr,tc});
      clearPremove();
      return true;
    } else {
      move(sr,sc,tr,tc);
      clearPremove();
      // Chain postMoveUpdate, but avoid recursion loops by direct call
      postMoveUpdate();
      return true;
    }
  }
  clearPremove();
  return false;
}

// --- Move list helpers ---
function squareName(r,c){ return String.fromCharCode('a'.charCodeAt(0)+c) + (8-r); }
function annotateAndRecordLastMove(isCheck, isMate){
  if(!pendingJustMoved) return;
  const {from,to,piece,capture,promo,castle,pieceClass} = pendingJustMoved;
  pendingJustMoved = null;
  const fromSq = squareName(from[0], from[1]);
  const toSq = squareName(to[0], to[1]);
  // Build SAN-like
  let san = '';
  if(castle){
    san = castle==='K' ? 'O-O' : 'O-O-O';
  } else {
    const pieceType = piece.toUpperCase();
    const isPawn = pieceType==='P';
    const dest = toSq;
    if(!isPawn){ san += 'RNBQK' .includes(pieceType) ? pieceType : ''; }
    // basic disambiguation omitted for brevity
    if(capture){
      if(isPawn && fromSq) san += fromSq[0];
      san += 'x';
    }
    san += dest;
    if(promo){ san += '=' + promo.toString().toUpperCase(); }
  }
  if(isMate) san += '#'; else if(isCheck) san += '+';
  const color = isWhite(piece) ? 'white' : 'black';
  const num = color==='white' ? Math.floor(plyCount/2)+1 : Math.floor((plyCount+1)/2);
  const text = `${fromSq}${capture?'x':'-'}${toSq}`; // keep coordinate for debugging/highlight
  moveHistory.push({ num, color, text, san, pieceClass, from:[...from], to:[...to] });
  plyCount++;
}

function renderMoveList(){
  if(!moveListEl) return;
  // Group by move number into rows "1. e4 e5"
  const rows = [];
  const byNum = new Map();
  for(const m of moveHistory){
    if(!byNum.has(m.num)) byNum.set(m.num, { num:m.num, w:null, b:null });
    const row = byNum.get(m.num);
    if(m.color==='white') row.w = m; else row.b = m;
  }
  const sorted = Array.from(byNum.values()).sort((a,b)=>a.num-b.num);
  let html = '';
  for(const row of sorted){
    html += `<span class="ply"><span class="num">${row.num}.</span>`;
    if(row.w){
      const pc = row.w.pieceClass || '';
      html += `<span class="m ${isLastMove(row.w)?'active':''}" data-idx="${indexOfMove(row.w)}">`+
              `${pc? `<span class="piece icon ${pc}"></span>`:''}<span>${row.w.san||row.w.text}</span></span>`;
    }
    if(row.b){
      const pc = row.b.pieceClass || '';
      html += ` <span class="m ${isLastMove(row.b)?'active':''}" data-idx="${indexOfMove(row.b)}">`+
              `${pc? `<span class="piece icon ${pc}"></span>`:''}<span>${row.b.san||row.b.text}</span></span>`;
    }
    html += `</span>`;
  }
  moveListEl.innerHTML = html;
  // auto-scroll to bottom
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function isLastMove(m){
  if(!lastMove) return false;
  return m.from[0]===lastMove.from[0] && m.from[1]===lastMove.from[1] && m.to[0]===lastMove.to[0] && m.to[1]===lastMove.to[1];
}
function indexOfMove(m){ return moveHistory.findIndex(x=>x===m); }

// Click on move list to highlight that move
if(moveListEl){
  moveListEl.addEventListener('click', (e)=>{
    const el = e.target.closest('.m'); if(!el) return;
    const idx = +el.dataset.idx;
    const m = moveHistory[idx]; if(!m) return;
    lastMove = { from:[...m.from], to:[...m.to] };
    render();
  });
}

// --- Controls wiring ---
if(clearArrowsBtn){ clearArrowsBtn.addEventListener('click', ()=>{ arrows=[]; drawArrows(); }); }
if(darkToggle){
  // init from localStorage
  const saved = localStorage.getItem('darkMode') === '1';
  if(saved){ document.body.classList.add('dark'); darkToggle.checked = true; }
  darkToggle.addEventListener('change', ()=>{
    document.body.classList.toggle('dark', darkToggle.checked);
    localStorage.setItem('darkMode', darkToggle.checked ? '1':'0');
  });
}

// --- Legality and game state helpers ---
function filterSelfCheckMoves(r,c,moves){
  const piece = board[r][c];
  const legal = [];
  for(const [tr,tc] of moves){
    const snap = makeSnapshot();
    applyMoveForTest(r,c,tr,tc);
    const inCheck = isOwnKingInCheck(isWhite(piece));
    restoreSnapshot(snap);
    if(!inCheck) legal.push([tr,tc]);
  }
  return legal;
}

function makeSnapshot(){
  return {
    board: board.map(row=>[...row]),
    enPassant: enPassant? [...enPassant]: null,
    whiteToMove,
    castle: { ...castle }
  };
}

function restoreSnapshot(s){
  board = s.board.map(row=>[...row]);
  enPassant = s.enPassant? [...s.enPassant]: null;
  whiteToMove = s.whiteToMove;
  castle = { ...s.castle };
}

function applyMoveForTest(sr,sc,tr,tc){
  const piece = board[sr][sc];
  const white = isWhite(piece);
  const dir = white? -1: 1;

  // en passant capture
  if(piece.toLowerCase()==='p' && sc!==tc && board[tr][tc]==='.' && enPassant && tr===enPassant[0] && tc===enPassant[1]){
    board[tr - dir][tc] = '.';
  }
  // castling
  if(piece.toLowerCase()==='k' && Math.abs(tc - sc)===2){
    if(tc===6 && white){ board[7][6]=piece; board[7][4]='.'; board[7][5]=board[7][7]; board[7][7]='.'; }
    else if(tc===2 && white){ board[7][2]=piece; board[7][4]='.'; board[7][3]=board[7][0]; board[7][0]='.'; }
    else if(tc===6 && !white){ board[0][6]=piece; board[0][4]='.'; board[0][5]=board[0][7]; board[0][7]='.'; }
    else if(tc===2 && !white){ board[0][2]=piece; board[0][4]='.'; board[0][3]=board[0][0]; board[0][0]='.'; }
  } else {
    board[tr][tc] = piece;
    board[sr][sc] = '.';
  }

  // Promotion assumed to queen for test
  if(piece==='P' && tr===0) board[tr][tc]='Q';
  if(piece==='p' && tr===7) board[tr][tc]='q';
}

function isOwnKingInCheck(white){
  const [kr,kc] = findKing(white);
  return isSquareAttacked(kr,kc, !white, white);
}

function findKing(white){
  const target = white? 'K':'k';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++) if(board[r][c]===target) return [r,c];
  }
  return [-1,-1];
}

// isSquareAttacked(r,c, byWhite, defendingWhite)
function isSquareAttacked(r,c, byWhite, defendingWhite){
  // Pawns (note: from the target square's perspective)
  // If attacked by white, a white pawn must be one row BELOW (r+1) diagonally.
  // If attacked by black, a black pawn must be one row ABOVE (r-1) diagonally.
  for(const dc of [-1,1]){
    const pr = byWhite ? r+1 : r-1;
    const pc = c+dc;
    if(isInside(pr,pc)){
      const p = board[pr][pc];
      if(p === (byWhite? 'P':'p')) return true;
    }
  }
  // Knights
  const kD = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  for(const [dr,dc] of kD){
    const nr=r+dr, nc=c+dc; if(!isInside(nr,nc)) continue;
    const p=board[nr][nc];
    if(p && p!=='.' && (byWhite? isWhite(p): isBlack(p)) && p.toLowerCase()==='n') return true;
  }
  // Bishops/Queens (diagonals)
  for(const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    let nr=r+dr, nc=c+dc;
    while(isInside(nr,nc)){
      const p=board[nr][nc];
      if(p!=='.'){
        if((byWhite? isWhite(p): isBlack(p)) && (p.toLowerCase()==='b' || p.toLowerCase()==='q')) return true;
        break;
      }
      nr+=dr; nc+=dc;
    }
  }
  // Rooks/Queens (straight)
  for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
    let nr=r+dr, nc=c+dc;
    while(isInside(nr,nc)){
      const p=board[nr][nc];
      if(p!=='.'){
        if((byWhite? isWhite(p): isBlack(p)) && (p.toLowerCase()==='r' || p.toLowerCase()==='q')) return true;
        break;
      }
      nr+=dr; nc+=dc;
    }
  }
  // King (adjacent)
  for(let dr=-1; dr<=1; dr++){
    for(let dc=-1; dc<=1; dc++){
      if(dr===0&&dc===0) continue;
      const nr=r+dr, nc=c+dc; if(!isInside(nr,nc)) continue;
      const p=board[nr][nc];
      if(p && p!=='.' && (byWhite? isWhite(p): isBlack(p)) && p.toLowerCase()==='k') return true;
    }
  }
  return false;
}

function postMoveUpdate(){
  // Toggle side
  whiteToMove = !whiteToMove;
  switchTimer();
  updateActivePlayerUI();
  // Start clocks only after the very first move has been made
  if(!started && !gameOver){
    started = true;
    startTimer();
  }
  // Now that turn switched, let bot move if it's their turn
  triggerBotMoveIfNeeded();

  // Update check state for side to move
  checkState.whiteInCheck = isOwnKingInCheck(true);
  checkState.blackInCheck = isOwnKingInCheck(false);

  // Determine if side to move has any legal moves
  const anyMoves = hasAnyLegalMoves(whiteToMove);
  if(!anyMoves){
    const inCheck = whiteToMove ? checkState.whiteInCheck : checkState.blackInCheck;
    if(inCheck){
      gameOver = true;
      statusEl.textContent = `${whiteToMove? 'Black':'White'} wins • Checkmate`;
      stopTimer();
    } else {
      gameOver = true;
      statusEl.textContent = `Draw • Stalemate`;
      stopTimer();
    }
  }
  // Record move notation for the move that just happened
  annotateAndRecordLastMove(!gameOver && (whiteToMove ? checkState.whiteInCheck : checkState.blackInCheck), !anyMoves);
  // If no end, attempt premove
  if(!gameOver){
    if(tryApplyPremove()) return; // postMoveUpdate() already called if executed
  }
  render();
}

function hasAnyLegalMoves(forWhite){
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=board[r][c];
      if(p==='.') continue;
      if(forWhite && !isWhite(p)) continue;
      if(!forWhite && !isBlack(p)) continue;
      const moves = legalMoves(r,c);
      if(moves.length>0) return true;
    }
  }
  return false;
}

// --- Arrow overlay helpers ---
function sizeCanvas(){
  if(!arrowCanvas) return;
  const rect = boardEl.getBoundingClientRect();
  arrowCanvas.width = Math.floor(rect.width);
  arrowCanvas.height = Math.floor(rect.height);
}

function boardToCanvasCenter(r,c){
  if(!arrowCanvas) return [0,0];
  const w = arrowCanvas.width; const h = arrowCanvas.height;
  const cw = w/8, ch = h/8;
  return [c*cw + cw/2, r*ch + ch/2];
}

function drawArrows(){
  if(!arrowCanvas) return;
  const ctx = arrowCanvas.getContext('2d');
  ctx.clearRect(0,0,arrowCanvas.width, arrowCanvas.height);
  for(const a of arrows) drawArrow(ctx,a);
}

function drawArrow(ctx, a){
  const color = a.color || 'rgba(255,0,0,0.85)';
  const [x1,y1] = boardToCanvasCenter(a.from[0], a.from[1]);
  const [x2,y2] = boardToCanvasCenter(a.to[0], a.to[1]);
  const dx = x2-x1, dy = y2-y1; const len = Math.hypot(dx,dy);
  if(len < 5) return;
  const ux = dx/len, uy = dy/len;
  const head = 18, tail = 10;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 8; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - ux*head, y2 - uy*head);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux*head - uy*tail, y2 - uy*head + ux*tail);
  ctx.lineTo(x2 - ux*head + uy*tail, y2 - uy*head - ux*tail);
  ctx.closePath();
  ctx.fill();
}

function getSquareFromEvent(e){
  const rect = boardEl.getBoundingClientRect();
  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  if(x<0||y<0||x>rect.width||y>rect.height) return null;
  const c = Math.floor(x / (rect.width/8));
  const r = Math.floor(y / (rect.height/8));
  return [r,c];
}

// Attach right-click handlers once
if(boardEl && boardEl.parentElement){
  const bc = boardEl.parentElement;
  bc.addEventListener('contextmenu', (e)=> e.preventDefault());
  // Left-click anywhere on the board container clears all arrows
  bc.addEventListener('mousedown', (e)=>{
    if(e.button===0){
      if(arrows.length){ arrows = []; drawArrows(); }
    }
  });
  bc.addEventListener('mousedown', (e)=>{
    if(e.button!==2) return;
    const pos = getSquareFromEvent(e);
    if(!pos) return;
    arrowStart = pos;
  });
  bc.addEventListener('mouseup', (e)=>{
    if(e.button!==2) return;
    const pos = getSquareFromEvent(e);
    if(!pos || !arrowStart) { arrowStart=null; return; }
    const from = arrowStart, to = pos;
    arrowStart = null;
    const idx = arrows.findIndex(a=> a.from[0]===from[0] && a.from[1]===from[1] && a.to[0]===to[0] && a.to[1]===to[1]);
    if(idx>=0) arrows.splice(idx,1); else arrows.push({from,to,color:'rgba(255,0,0,0.85)'});
    drawArrows();
  });
  window.addEventListener('resize', ()=>{ sizeCanvas(); drawArrows(); });
}

// --- Stockfish engine integration (appended) ---
function ensureEngineInit(){
  if(engineInited) return;
  initEngine({
    getFEN: toFEN,
    onBestMove: applyEngineMove
  });
  setElo(botElo);
  engineInited = true;
}

function coordFromAlg(sq){
  const file = sq.charCodeAt(0) - 97; // a->0
  const rank = sq.charCodeAt(1) - 48; // '1'->1
  return [8 - rank, file];
}

function algFromCoord(r,c){
  return String.fromCharCode(97 + c) + String(8 - r);
}

function toFEN(){
  const rows=[];
  for(let r=0;r<8;r++){
    let row=''; let empty=0;
    for(let c=0;c<8;c++){
      const ch = board[r][c];
      if(ch==='.') empty++; else { if(empty){ row+=empty; empty=0; } row+=ch; }
    }
    if(empty) row+=empty;
    rows.push(row);
  }
  const placement = rows.join('/');
  const side = whiteToMove? 'w':'b';
  let rights='';
  if(castle.wK) rights+='K'; if(castle.wQ) rights+='Q'; if(castle.bK) rights+='k'; if(castle.bQ) rights+='q';
  if(!rights) rights='-';
  const ep = enPassant ? algFromCoord(enPassant[0], enPassant[1]) : '-';
  const half = 0; // not tracked
  const full = 1 + Math.floor(plyCount/2);
  return `${placement} ${side} ${rights} ${ep} ${half} ${full}`;
}

function triggerBotMoveIfNeeded(){
  if(!botEnabled) return;
  ensureEngineInit();
  setBotConfig({ enabled: botEnabled, playsWhite: botPlaysWhite });
  requestMoveIfNeeded(whiteToMove, gameOver, promotionPending);
}

function applyEngineMove(uci){
  const from = uci.slice(0,2), to = uci.slice(2,4);
  const promo = uci.length>4 ? uci[4] : null;
  const [sr,sc] = coordFromAlg(from);
  const [tr,tc] = coordFromAlg(to);
  const moving = board[sr][sc];
  if(!moving || moving==='.') return;
  const isPromo = (moving==='P' && tr===0) || (moving==='p' && tr===7);
  move(sr,sc,tr,tc);
  if(isPromo && promo){
    board[tr][tc] = (moving==='P') ? promo.toUpperCase() : promo.toLowerCase();
  }
  postMoveUpdate();
}

// Hook UI controls
if(modeSelect){
  const applyMode = ()=>{
    const v = modeSelect.value;
    if(v === 'pvp'){
      botEnabled = false;
      botPlaysWhite = false;
    } else if(v === 'bot_black'){
      botEnabled = true; // bot = black, human plays white
      botPlaysWhite = false;
    } else if(v === 'bot_white'){
      botEnabled = true; // bot = white, human plays black
      botPlaysWhite = true;
    }
    if(botEnabled){ ensureEngineInit(); }
    setBotConfig({ enabled: botEnabled, playsWhite: botPlaysWhite });
    // Reset and restart timer whenever mode changes
    resetGame();
  };
  modeSelect.addEventListener('change', applyMode);
  // Initialize mode on load
  applyMode();
}
if(botLevelSelect){
  botLevelSelect.addEventListener('change', ()=>{
    botElo = parseInt(botLevelSelect.value,10) || 1200;
    setElo(botElo);
    // Do not reset game for strength changes; optional: uncomment to reset
    // resetGame();
  });
}
