""" Plugins
"""" Dein-begin

if &runtimepath !~# '/dein.vim'
  let s:dein_dir = expand('~/.cache/dein/repos/github.com/Shougo/dein.vim')

  if !isdirectory(s:dein_dir)
    call system('git clone https://github.com/Shougo/dein.vim ' . shellescape(s:dein_dir))
  endif

  execute 'set runtimepath^=' . s:dein_dir
endif

call dein#begin(expand('~/.cache/dein'))

"""" Plugin manager
call dein#add('Shougo/dein.vim')
call dein#add('haya14busa/dein-command.vim')

"""" Format code:
call dein#add('tpope/vim-sleuth')                                     " Automatically detect tabs vs spaces
call dein#add('sbdchd/neoformat')                                     " Automatically format code
call dein#add('dhruvasagar/vim-table-mode')    


"""" Git
call dein#add('tpope/vim-fugitive')                                   " Git integration
call dein#add('airblade/vim-gitgutter')  

"""" Navigate files, buffers and panes

call dein#add('scrooloose/nerdtree')                                  " v2
call dein#add('majutsushi/tagbar')                                    " v2
call dein#add('wesQ3/vim-windowswap')                                 " v2

call dein#add('airblade/vim-rooter')                                  " Change working directory to the project root


call dein#add('junegunn/fzf', {'build': './install --bin'})           " Fuzzy search - binary
call dein#add('junegunn/fzf.vim')                                     " Fuzzy search - vim plugin

call dein#add('benizi/vim-automkdir')                                 " Automatically create missing folders on save
call dein#add('christoomey/vim-tmux-navigator')                       " Easy navigation between vim and tmux panes


"""" Language-specific

""""" Crystal
call dein#add('rhysd/vim-crystal')                                    " Crystal support


"""" Dein-end
call dein#end()

if dein#check_install()
  call dein#install()
endif


""" Keyboard shortcuts
"""" Leader
let mapleader="\\"
nmap <Space> <Leader>
vmap <Space> <Leader>


nnoremap <leader>n :NERDTreeFocus<CR>
nnoremap <C-n> :NERDTree<CR>
nnoremap <C-t> :NERDTreeToggle<CR>
nnoremap <C-f> :NERDTreeFind<CR>