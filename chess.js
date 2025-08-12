class ChessGame {
    constructor() {
        this.board = this.initializeBoard();
        this.currentTurn = 'white';
        this.selectedPiece = null;
        this.gameOver = false;
    }

    initializeBoard() {
        const PIECES = {
            'p': '♙',
            'r': '♖',
            'n': '♘',
            'b': '♗',
            'q': '♕',
            'k': '♔',
            'P': '♟',
            'R': '♜',
            'N': '♞',
            'B': '♝',
            'Q': '♛',
            'K': '♚',
        };

        const STARTING_POSITION = [
            'rnbqkbnr',
            'pppppppp',
            '........',
            '........',
            '........',
            '........',
            'PPPPPPPP',
            'RNBQKBNR'
        ];

        let board = [...STARTING_POSITION];
        let selectedPiece = null;
        let selectedSquare = null;
        let isWhiteTurn = true;
        let gameStatus = 'active';

        function createBoard() {
            const boardContainer = document.getElementById('chessBoard');
            boardContainer.innerHTML = '';

            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const square = document.createElement('div');
                    square.classList.add('square');
                    square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
                    square.dataset.row = row;
                    square.dataset.col = col;

                    const piece = board[row][col];
                    if (piece !== '.') {
                        const pieceElement = document.createElement('div');
                        pieceElement.classList.add('piece');
                        pieceElement.textContent = PIECES[piece];
                        square.appendChild(pieceElement);
                    }

                    square.addEventListener('click', () => handleSquareClick(square));
                    boardContainer.appendChild(square);
                }
            }
            updateStatus();
        }

        function handleSquareClick(square) {
            if (gameStatus !== 'active') return;

            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            const piece = board[row][col];

            if (!selectedPiece) {
                if (piece !== '.' && (piece === piece.toUpperCase() === isWhiteTurn)) {
                    selectedPiece = piece;
                    selectedSquare = square;
                    square.classList.add('selected');
                    showPossibleMoves(row, col);
                }
            } else {
                if (isValidMove(row, col)) {
                    makeMove(row, col);
                } else if (piece === piece.toUpperCase() === isWhiteTurn) {
                    selectedPiece = piece;
                    selectedSquare = square;
                    square.classList.add('selected');
                    showPossibleMoves(row, col);
                }
                clearSelection();
            }
        }

        function handleDragStart(e) {
            if (gameStatus !== 'active') return;

            const square = e.target.closest('.square');
            const piece = square.querySelector('.piece');
            if (!piece) return;

            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            
            if (board[row][col] === board[row][col].toUpperCase() === isWhiteTurn) {
                draggedPiece = piece;
                draggedSquare = square;
                piece.classList.add('dragging');
                
                // Create a ghost piece for visual feedback
                const ghostPiece = piece.cloneNode(true);
                ghostPiece.classList.add('ghost-piece');
                ghostPiece.style.opacity = '0.5';
                square.appendChild(ghostPiece);
            }
        }

        function handleDragOver(e) {
            e.preventDefault();
            const square = e.target.closest('.square');
            if (square) {
                square.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            const square = e.target.closest('.square');
            if (square) {
                square.classList.remove('drag-over');
            }
        }

        function handleDrop(e) {
            e.preventDefault();
            const targetSquare = e.target.closest('.square');
            if (!targetSquare || !draggedPiece) return;

            const targetRow = parseInt(targetSquare.dataset.row);
            const targetCol = parseInt(targetSquare.dataset.col);
            
            if (isValidMove(targetRow, targetCol)) {
                makeMove(targetRow, targetCol);
            }
            
            clearDrag();
        }

        function clearDrag() {
            if (draggedSquare) {
                draggedSquare.querySelector('.ghost-piece')?.remove();
                draggedPiece?.classList.remove('dragging');
                draggedSquare.classList.remove('drag-over');
                draggedPiece = null;
                draggedSquare = null;
            }
        }

        let draggedPiece = null;
        let draggedSquare = null;

        function showPossibleMoves(fromRow, fromCol) {
            const moves = getValidMoves(fromRow, fromCol);
            moves.forEach(([row, col]) => {
                const square = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (square) {
                    square.classList.add('possible-move');
                }
            });
        }

        function getValidMoves(fromRow, fromCol) {
            const moves = [];
            const piece = board[fromRow][fromCol];

            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (isValidMove(row, col)) {
                        moves.push([row, col]);
                    }
                }
            }

            return moves;
        }

        function isValidMove(toRow, toCol) {
            const fromRow = parseInt(selectedSquare.dataset.row);
            const fromCol = parseInt(selectedSquare.dataset.col);
            const piece = selectedPiece;
            const targetPiece = board[toRow][toCol];

            // Check if target square is empty or contains opponent's piece
            if (targetPiece !== '.' && targetPiece === targetPiece.toUpperCase() === isWhiteTurn) {
                return false;
            }

            // Basic move validation based on piece type
            switch (piece.toLowerCase()) {
                case 'p':
                    return isValidPawnMove(fromRow, fromCol, toRow, toCol);
                case 'r':
                    return isValidRookMove(fromRow, fromCol, toRow, toCol);
                case 'n':
                    return isValidKnightMove(fromRow, fromCol, toRow, toCol);
                case 'b':
                    return isValidBishopMove(fromRow, fromCol, toRow, toCol);
                case 'q':
                    return isValidQueenMove(fromRow, fromCol, toRow, toCol);
                case 'k':
                    return isValidKingMove(fromRow, fromCol, toRow, toCol);
                default:
                    return false;
            }
        }

        function isValidPawnMove(fromRow, fromCol, toRow, toCol) {
            const direction = isWhiteTurn ? -1 : 1;
            const startRow = isWhiteTurn ? 6 : 1;

            // Move forward
            if (fromCol === toCol && !board[toRow][toCol]) {
                if (toRow === fromRow + direction) return true;
                if (toRow === fromRow + 2 * direction && fromRow === startRow) return true;
            }
            // Capture diagonally
            if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction) {
                return board[toRow][toCol] && board[toRow][toCol] !== board[toRow][toCol].toUpperCase() === isWhiteTurn;
            }
            return false;
        }

        function isValidRookMove(fromRow, fromCol, toRow, toCol) {
            if (fromRow === toRow || fromCol === toCol) {
                return !isPathBlocked(fromRow, fromCol, toRow, toCol);
            }
            return false;
        }

        function isValidKnightMove(fromRow, fromCol, toRow, toCol) {
            const rowDiff = Math.abs(fromRow - toRow);
            const colDiff = Math.abs(fromCol - toCol);
            return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
        }

        function isValidBishopMove(fromRow, fromCol, toRow, toCol) {
            if (Math.abs(fromRow - toRow) === Math.abs(fromCol - toCol)) {
                return !isPathBlocked(fromRow, fromCol, toRow, toCol);
            }
            return false;
        }

        function isValidQueenMove(fromRow, fromCol, toRow, toCol) {
            return isValidRookMove(fromRow, fromCol, toRow, toCol) || 
                   isValidBishopMove(fromRow, fromCol, toRow, toCol);
        }

        function isValidKingMove(fromRow, fromCol, toRow, toCol) {
            const rowDiff = Math.abs(fromRow - toRow);
            const colDiff = Math.abs(fromCol - toCol);
            return rowDiff <= 1 && colDiff <= 1;
        }

        function isPathBlocked(fromRow, fromCol, toRow, toCol) {
            if (fromRow === toRow) {
                const start = Math.min(fromCol, toCol);
                const end = Math.max(fromCol, toCol);
                for (let i = start + 1; i < end; i++) {
                    if (board[fromRow][i] !== '.') return true;
                }
            } else if (fromCol === toCol) {
                const start = Math.min(fromRow, toRow);
                const end = Math.max(fromRow, toRow);
                for (let i = start + 1; i < end; i++) {
                    if (board[i][fromCol] !== '.') return true;
                }
            } else {
                const rowDir = toRow > fromRow ? 1 : -1;
                const colDir = toCol > fromCol ? 1 : -1;
                for (let i = 1; i < Math.abs(toRow - fromRow); i++) {
                    if (board[fromRow + i * rowDir][fromCol + i * colDir] !== '.') return true;
                }
            }
            return false;
        }

        function makeMove(toRow, toCol) {
            const fromRow = parseInt(selectedSquare.dataset.row);
            const fromCol = parseInt(selectedSquare.dataset.col);
            
            // Update board state
            board[toRow] = board[toRow].substring(0, toCol) + selectedPiece + board[toRow].substring(toCol + 1);
            board[fromRow] = board[fromRow].substring(0, fromCol) + '.' + board[fromRow].substring(fromCol + 1);
            
            // Update UI
            createBoard();
            
            // Switch turns
            isWhiteTurn = !isWhiteTurn;
            
            // Check for game over
            checkGameOver();
        }

        function checkGameOver() {
            const opponentColor = isWhiteTurn ? 'white' : 'black';
            const opponentKing = isWhiteTurn ? 'K' : 'k';
            
            // Find opponent's king
            let kingRow = -1, kingCol = -1;
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (board[row][col] === opponentKing) {
                        kingRow = row;
                        kingCol = col;
                        break;
                    }
                }
                if (kingRow !== -1) break;
            }
            
            if (kingRow === -1) {
                gameStatus = 'checkmate';
                updateStatus();
                return;
            }
            
            // Check if king is in check
            let inCheck = false;
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = board[row][col];
                    if (piece !== '.' && piece === piece.toUpperCase() !== isWhiteTurn) {
                        selectedPiece = piece;
                        selectedSquare = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                        if (isValidMove(kingRow, kingCol)) {
                            inCheck = true;
                            break;
                        }
                    }
                }
                if (inCheck) break;
            }
            
            // Check if there are any valid moves for opponent
            let hasValidMoves = false;
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = board[row][col];
                    if (piece !== '.' && piece === piece.toUpperCase() !== isWhiteTurn) {
                        selectedPiece = piece;
                        selectedSquare = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                        if (getValidMoves(row, col).length > 0) {
                            hasValidMoves = true;
                            break;
                        }
                    }
                }
                if (hasValidMoves) break;
            }
            
            if (!hasValidMoves) {
                gameStatus = inCheck ? 'checkmate' : 'stalemate';
                updateStatus();
            }
        }

        function clearSelection() {
            if (selectedSquare) {
                selectedSquare.classList.remove('selected');
                selectedSquare = null;
                selectedPiece = null;
            }
            
            // Remove possible move indicators
            const squares = document.querySelectorAll('.square');
            squares.forEach(square => square.classList.remove('possible-move'));
        }

        function updateStatus() {
            const statusElement = document.querySelector('.status');
            if (gameStatus === 'active') {
                statusElement.textContent = `${isWhiteTurn ? 'White' : 'Black'}'s turn`;
                statusElement.classList.remove('in-check');
            } else if (gameStatus === 'checkmate') {
                statusElement.textContent = `${isWhiteTurn ? 'Black' : 'White'} wins! Checkmate!`;
            } else if (gameStatus === 'stalemate') {
                statusElement.textContent = 'Game over! Stalemate!';
            }

            // Check if king is in check
            const opponentColor = isWhiteTurn ? 'white' : 'black';
            const opponentKing = isWhiteTurn ? 'K' : 'k';
            let kingIsInCheck = false;

            // Find opponent's king
            let kingRow = -1, kingCol = -1;
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (board[row][col] === opponentKing) {
                        kingRow = row;
                        kingCol = col;
                        break;
                    }
                }
                if (kingRow !== -1) break;
            }

            // Check if king is in check
            if (kingRow !== -1) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        const piece = board[row][col];
                        if (piece !== '.' && piece === piece.toUpperCase() !== isWhiteTurn) {
                            selectedPiece = piece;
                            selectedSquare = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                            if (isValidMove(kingRow, kingCol)) {
                                kingIsInCheck = true;
                                break;
                            }
                        }
                    }
                    if (kingIsInCheck) break;
                }
            }

            if (kingIsInCheck && gameStatus === 'active') {
                statusElement.classList.add('in-check');
                statusElement.textContent += ' - Check!';
            }
        }

        // Reset game button
        const resetButton = document.getElementById('resetGame');
        resetButton.addEventListener('click', () => {
            board = [...STARTING_POSITION];
            selectedPiece = null;
            selectedSquare = null;
            isWhiteTurn = true;
            gameStatus = 'active';
            createBoard();
        });

        // Initialize the game
        createBoard();

        return board;
    }

    isValidMove(from, to) {
        if (this.gameOver) return false;
        const piece = this.board[from[0]][from[1]];
        if (!piece || piece.toLowerCase() !== this.currentTurn[0]) return false;

        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        // Get piece type (lowercase for easier comparison)
        const pieceType = piece.toLowerCase();
        const enemyColor = this.currentTurn === 'white' ? 'black' : 'white';

        // Check if destination is occupied by same color piece
        const targetPiece = this.board[toRow][toCol];
        if (targetPiece && targetPiece.toLowerCase() === pieceType) return false;

        // Piece-specific move validation
        switch(pieceType) {
            case 'p': // Pawn
                if (piece === 'P') { // White pawn
                    if (fromRow === 6 && toRow === 4 && fromCol === toCol && !targetPiece) return true; // Double move from starting position
                    if (fromRow - toRow === 1 && fromCol === toCol && !targetPiece) return true; // Forward move
                    if (fromRow - toRow === 1 && Math.abs(fromCol - toCol) === 1 && targetPiece) return true; // Capture
                } else { // Black pawn
                    if (fromRow === 1 && toRow === 3 && fromCol === toCol && !targetPiece) return true; // Double move from starting position
                    if (toRow - fromRow === 1 && fromCol === toCol && !targetPiece) return true; // Forward move
                    if (toRow - fromRow === 1 && Math.abs(fromCol - toCol) === 1 && targetPiece) return true; // Capture
                }
                return false;

            case 'r': // Rook
                if (fromRow === toRow || fromCol === toCol) {
                    // Check if path is clear
                    const rowDiff = Math.abs(toRow - fromRow);
                    const colDiff = Math.abs(toCol - fromCol);
                    const dirRow = toRow > fromRow ? 1 : -1;
                    const dirCol = toCol > fromCol ? 1 : -1;

                    for (let i = 1; i < Math.max(rowDiff, colDiff); i++) {
                        const checkRow = fromRow + (dirRow * i);
                        const checkCol = fromCol + (dirCol * i);
                        if (this.board[checkRow][checkCol]) return false;
                    }
                    return true;
                }
                return false;

            case 'n': // Knight
                const rowDiff = Math.abs(toRow - fromRow);
                const colDiff = Math.abs(toCol - fromCol);
                return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);

            case 'b': // Bishop
                if (Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol)) {
                    // Check if path is clear
                    const dirRow = toRow > fromRow ? 1 : -1;
                    const dirCol = toCol > fromCol ? 1 : -1;

                    for (let i = 1; i < Math.abs(toRow - fromRow); i++) {
                        const checkRow = fromRow + (dirRow * i);
                        const checkCol = fromCol + (dirCol * i);
                        if (this.board[checkRow][checkCol]) return false;
                    }
                    return true;
                }
                return false;

            case 'q': // Queen
                return this.isValidMove(from, [toRow, fromCol]) || // Rook-like move
                       this.isValidMove(from, [fromRow, toCol]) || // Rook-like move
                       this.isValidMove(from, [toRow, toCol]);     // Bishop-like move

            case 'k': // King
                return Math.abs(toRow - fromRow) <= 1 && Math.abs(toCol - fromCol) <= 1;
        }
        return false;
    }

    makeMove(from, to) {
        if (!this.isValidMove(from, to)) return false;

        const piece = this.board[from[0]][from[1]];
        const targetPiece = this.board[to[0]][to[1]];

        // Handle pawn promotion
        if (piece.toLowerCase() === 'p' && 
            ((piece === 'P' && to[0] === 0) || 
             (piece === 'p' && to[0] === 7))) {
            this.board[to[0]][to[1]] = piece === 'P' ? 'Q' : 'q';
        } else {
            this.board[to[0]][to[1]] = piece;
        }
        this.board[from[0]][from[1]] = '';
        
        // Check for checkmate
        if (this.isCheckmate()) {
            this.gameOver = true;
            return 'checkmate';
        }

        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
        return true;
    }

    isCheckmate() {
        // Simple checkmate detection - needs improvement
        const enemyColor = this.currentTurn === 'white' ? 'black' : 'white';
        const king = enemyColor === 'white' ? 'K' : 'k';
        
        // Find enemy king
        let kingPos = null;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.board[row][col] === king) {
                    kingPos = [row, col];
                    break;
                }
            }
            if (kingPos) break;
        }

        if (!kingPos) return false; // Should never happen

        // Check if king is in check
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.toLowerCase() === this.currentTurn[0]) {
                    if (this.isValidMove([row, col], kingPos)) {
                        // Check if there are any valid moves to escape check
                        const enemyPieces = this.getEnemyPieces();
                        for (const piece of enemyPieces) {
                            const moves = this.getValidMoves(piece);
                            if (moves.length > 0) return false;
                        }
                        return true;
                    }
                }
            }
        }
        return false;
    }

    getEnemyPieces() {
        const enemyColor = this.currentTurn === 'white' ? 'black' : 'white';
        const pieces = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.toLowerCase() === enemyColor[0]) {
                    pieces.push([row, col]);
                }
            }
        }
        return pieces;
    }

    getValidMoves(position) {
        const moves = [];
        const piece = this.board[position[0]][position[1]];
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.isValidMove(position, [row, col])) {
                    moves.push([row, col]);
                }
            }
        }
        return moves;
    }

    resetGame() {
        this.board = this.initializeBoard();
        this.currentTurn = 'white';
        this.selectedPiece = null;
        this.gameOver = false;
    }
}

// Initialize game
const game = new ChessGame();
