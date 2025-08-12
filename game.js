document.addEventListener('DOMContentLoaded', () => {
    const chessBoard = document.getElementById('chessBoard');
    const status = document.querySelector('.status');
    const resetButton = document.getElementById('resetGame');

    // Create board squares
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = `square ${row % 2 === col % 2 ? 'white' : 'black'}`;
            square.dataset.row = row;
            square.dataset.col = col;
            chessBoard.appendChild(square);
        }
    }

    // Update board display
    function updateBoard() {
        const squares = document.querySelectorAll('.square');
        squares.forEach(square => {
            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);
            const piece = game.board[row][col];
            square.textContent = piece;
            
            // Add piece color class for styling
            if (piece) {
                const color = piece === piece.toUpperCase() ? 'white' : 'black';
                square.classList.add(`piece-${color}`);
            } else {
                square.classList.remove('piece-white', 'piece-black');
            }
        });
        
        // Update status
        if (game.gameOver) {
            status.textContent = `Checkmate! ${game.currentTurn} wins!`;
        } else {
            status.textContent = `${game.currentTurn[0].toUpperCase() + game.currentTurn.slice(1)}'s turn`;
        }
    }

    // Handle piece selection and movement
    let selectedSquare = null;

    chessBoard.addEventListener('click', (e) => {
        if (!e.target.classList.contains('square')) return;

        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);
        const square = e.target;

        if (selectedSquare) {
            const from = [parseInt(selectedSquare.dataset.row), parseInt(selectedSquare.dataset.col)];
            const to = [row, col];
            
            if (game.makeMove(from, to)) {
                if (game.gameOver) {
                    status.textContent = `Checkmate! ${game.currentTurn} wins!`;
                }
                selectedSquare.classList.remove('selected');
                selectedSquare = null;
                updateBoard();
            }
        } else {
            const piece = game.board[row][col];
            if (piece && piece.toLowerCase() === game.currentTurn[0]) {
                // Clear previous highlights
                document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
                
                // Highlight possible moves
                const moves = game.getValidMoves([row, col]);
                moves.forEach(([moveRow, moveCol]) => {
                    const moveSquare = document.querySelector(`[data-row="${moveRow}"][data-col="${moveCol}"]`);
                    if (moveSquare) moveSquare.classList.add('highlight');
                });
                
                selectedSquare = square;
                selectedSquare.classList.add('selected');
            }
        }
    });

    // Reset game
    resetButton.addEventListener('click', () => {
        game.resetGame();
        selectedSquare = null;
        updateBoard();
    });

    // Initial board setup
    updateBoard();
});

