Maid.rules do
  ## Trash a bunch of downloaded stuffs ##

  rule 'Trash duplicate downloads' do
    # Keep the dupe with the shortest filename
    trash verbose_dupes_in('~/Downloads/*')
  end

  rule 'Trash development downloads' do
    files('~/Downloads/*').each do |path|
      if downloaded_from(path).any? { |u| u.match %r{//(localhost|[^\.]+\.dev)} } and 1.week.since? accessed_at path
        trash path
      end
    end
  end

  rule 'Trash zips and tarballs downloaded from GitHub' do
    dir('~/Downloads/*.{zip,tgz,gz,rar,tar}').each do |path|
      if downloaded_from(path).any? { |u| u.match %r{//([^\/]+\.)?github\.com\/} }
        trash path
      end
    end
  end

x


  ## Save some downloaded stuffs ##

  rule 'Add downloaded music to iTunes' do
    move dir('~/Downloads/*.mp3').select { |p| duration_s(p) > 45.0 }, '~/Music/iTunes/Automatically Add to iTunes/'
  end

  rule 'Archive downloaded applications in zip files' do
    dir('~/Downloads/*.zip').each do |path|
      if zipfile_contents(path).any? { |c| c.match %r{\.app$} }
        move path, '~/Downloads/Applications'
      end
    end
  end

  # And organize the rest
  DOWNLOAD_TYPES = {
    'Applications' => ['public.disk-image', 'com.apple.application', 'com.apple.installer-package-archive'],
    'Archives'     => 'public.archive',
    'Audio'        => 'public.audio',
    'Images'       => 'public.image',
    'PDFs'         => 'com.adobe.pdf',
    'Video'        => 'public.movie',
  }
  DOWNLOAD_TYPES.each do |sub_dir, types|
    rule "Move downloaded #{sub_dir.downcase}" do
      move where_content_type(dir('~/Downloads/*.*'), types), mkdir("~/Downloads/#{sub_dir}")
    end
  end


  ## Desktop cleanup ##

  rule 'Archive old screenshots on the Desktop' do
    move dir('~/Desktop/Screen Shot *').select { |p| 2.days.since? accessed_at p }, mkdir('~/Documents/Screenshots/')
  end

  rule 'Archive old links on the Desktop' do
    move dir('~/Desktop/*.webloc').select { |p| 7.days.since? created_at p }, mkdir('~/Desktop/Links')
  end

  rule 'Remove empty directories' do
    dir(['~/Desktop/*', '~/Downloads/*']).each do |path|
      if File.directory?(path) && dir("#{ path }/*").empty?
        trash(path)
      end
    end
  end
end



require 'colorize'
require 'ruby-growl'
require 'fileutils'
require 'yaml'
require 'pp'
require 'terminal-notifier-guard'
require_relative 'icon'

g = Growl.new "localhost", "Maid Notifaction", "GNTP"

TerminalNotifier::Guard.notify('Hello World')
Maid.rules do

  rule 'Get Mime Type' do
    dir('~/Downloads/*').each do |path|
      mimetype = content_types(path)
      puts "\e[38;5;13m#{File.basename(path)}\e[38;5;45m#{File.extname(path)}\e[38;5;243m ---> #{mimetype}"
    end
  end

  rule 'Trash temps from Downloads' do
    puts "\n--------------------------------------------\n\033[32mRemove temps from Downloads\033[0m"
    trash dir('~/Downloads/*.torrent')
  end

  #
  # Get rid of the zip file if we have a matching dir
  #
  rule 'Remove unzipped file if zipped file exists' do
    puts "--------------------------------------------\n\033[32mRemove unzipped file if zipped file exists\033[0m"
    found = dir('~/Downloads/**/*').select do |path|
      result = path.match(/(.*)\.zip$/) || path.match(/(.*)\.tar\.gz$/)
      if result
        File.exist?(result[1])
      end
    end
    trash found
  end

  #
  # Get rid of the zip file if we have a matching dir
  #
  # rule '3D Models: Remove unzipped file if zipped file exists' do
  #   puts "--------------------------------------------\n\033[32m3D Models: Remove unzipped file if zipped file exists\033[0m"
  #   found = dir('~/Dropbox/3D/models/**/*').select do |path|
  #     result = path.match(/(.*)\.zip$/)
  #     if result
  #       File.exist?(result[1])
  #     end
  #   end
  #   trash found
  # end


  #   .d8b.  d8888b. d8888b. .d8888.
  #  d8' `8b 88  `8D 88  `8D 88'  YP
  #  88ooo88 88oodD' 88oodD' `8bo.
  #  88~~~88 88~~~   88~~~     `Y8b.
  #  88   88 88      88      db   8D
  #  YP   YP 88      88      `8888Y'
  #
  #
  # Clean App Names
  #
  rule 'Clean Cracked Apps Names' do
    dir('~/Downloads/01 Apps/*').each do |path|
      if File.directory?(path)
        if result = path.match(/(.*)Multil/) || result = path.match(/(.*)[\._][Mm][Aa][Cc][oO][sS][xX]/)
          begin
            rename(path, result[1].gsub(/(\D)[\._](\D)/, '\1 \2'))
          rescue
            puts "Couldn't rename #{path}"
          end
        end
      end
    end
  end

  #  .88b  d88.  .d88b.  db    db d888888b d88888b .d8888.
  #  88'YbdP`88 .8P  Y8. 88    88   `88'   88'     88'  YP
  #  88  88  88 88    88 Y8    8P    88    88ooooo `8bo.
  #  88  88  88 88    88 `8b  d8'    88    88~~~~~   `Y8b.
  #  88  88  88 `8b  d8'  `8bd8'    .88.   88.     db   8D
  #  YP  YP  YP  `Y88P'     YP    Y888888P Y88888P `8888Y'
  #
  rule 'Clean Up Movies' do
    dir('~/Downloads/02 Movies/*').each do |path|
      if File.directory?(path)
        # Start the sizeof
        begin
          if (size_of(file) < 100000000 && !File.directory?(file))
            puts "Killing sample or garbage file #{file}\n"
            trash(file)
            next
          end
        rescue
          puts "\033[31mError getting path size of: #{path}\n\033[0m"
        end
      end
    end
  end
  # rule 'Move Movies' do
  #   puts "--------------------------------------------\n\033[32mMove Movies\033[0m"
  #   dir(['~/Downloads/00 Completed/**/*.mp4', '~/Downloads/00 Completed/**/*.avi', '~/Downloads/00 Completed/**/*.mkv']).each do |path|
  #     # if !path.match(/00 Movies/)
  #       # puts "Path match"
  #     # end
  #     if !path.match(/00 Movies/) && !path.match(/00 TV/)
  #       # Iterate through all the files
  #       dir(File.dirname(path)+"*/*[avi|mkv|mp4]").each do |file|
  #         # Files/Directories to ignore
  #         if file == '/Users/eboney/Downloads/00 Completed'
  #           puts "Ignoring #{file}\n".yellow
  #           next
  #         end
  #         if File.directory?(file)
  #           # g.add_notification "Duplicate", nil, MAID_ICONS::DUPLICATE
  #           # g.notify "Duplicate", "Rule: Remove duplicate files", "Remove duplicate file #{File.basename(file)}"
  #           # puts say_hello("balls")
  #           puts "File exists as #{file}\n".blue
  #           next
  #         end

  #         # Start the sizeof
  #         begin
  #           if (size_of(file) < 100000000 && !File.directory?(file))
  #             puts "Killing sample or garbage file #{file}\n"
  #             trash(file)
  #             next
  #           end
  #         rescue
  #           puts "\033[31mError getting path size of: #{path}\n\033[0m"
  #         end

  #         # Check if it's a directory
  #         begin
  #           if (Dir.entries(File.dirname(file)) - %w{ . .. }).empty?
  #             trash(File.dirname(file))
  #           end
  #         rescue
  #           puts "\033[31mError removing #{File.dirname(path)}\n\033[0m"
  #         end

  #         # Check for TV
  #         if file.match(/[sS][0-9][0-9][eE][0-9][0-9]/)
  #           move(file, '~/Downloads/00 TV')
  #         else
  #           move(file, '~/Downloads/00 Completed/00 Movies')
  #         end

  #       end
  #     end
  #   end
  # end

  #  d88888b  .d88b.  d8b   db d888888b .d8888.
  #  88'     .8P  Y8. 888o  88 `~~88~~' 88'  YP
  #  88ooo   88    88 88V8o 88    88    `8bo.
  #  88~~~   88    88 88 V8o88    88      `Y8b.
  #  88      `8b  d8' 88  V888    88    db   8D
  #  YP       `Y88P'  VP   V8P    YP    `8888Y'
  #
  rule 'Fonts in Downloads' do
    puts "--------------------------------------------\n\033[32mFonts in Downloads\033[0m"
    dir(%w(~/Downloads/*.ttf ~/Downloads/*.otf ~/Downloads/**/*.ttf ~/Downloads/**/*.otf ~/Downloads/**/*.TTF ~/Downloads/**/*.OTF)).each do |path|
      begin
        if !File.dirname(path).match(/Downloads$/) && !File.dirname(path).match(/04 Design/) && !File.dirname(path).match(/Wordpress/) && !path.match(/\.app/) && !File.dirname(path).match(/11 Ripped Sites/)
          # Let's clean bs files in there
          dir([File.dirname(path)+"/*.txt", File.dirname(path)+"/*.pdf", File.dirname(path)+"/*.jpg",File.dirname(path)+"/*.png"]).each do |rdmepath|
            trash rdmepath
          end
          # Now move the dir to Fonts dir
          move(File.dirname(path), '~/Dropbox/Fonts')
        end
        # if File.dirname(path).match(/Downloads$/) || File.dirname(path).match(/01 Design$/)
        #   move(path, '~/Dropbox/Fonts')
        # end
      rescue
        puts "\e[38;5;243mSkipping #{path} since we've already moved its parent dir"
      end
    end
  end



  #  d8888b.  .d88b.  db   d8b   db d8b   db db       .d88b.   .d8b.  d8888b. .d8888.
  #  88  `8D .8P  Y8. 88   I8I   88 888o  88 88      .8P  Y8. d8' `8b 88  `8D 88'  YP
  #  88   88 88    88 88   I8I   88 88V8o 88 88      88    88 88ooo88 88   88 `8bo.
  #  88   88 88    88 Y8   I8I   88 88 V8o88 88      88    88 88~~~88 88   88   `Y8b.
  #  88  .8D `8b  d8' `8b d8'8b d8' 88  V888 88booo. `8b  d8' 88   88 88  .8D db   8D
  #  Y8888D'  `Y88P'   `8b8' `8d8'  VP   V8P Y88888P  `Y88P'  YP   YP Y8888D' `8888Y'
  #
  DOWNLOAD_TYPES = {
    '14 Windows' => %w(com.microsoft.windows-executable),
    '03 Apps' => %w(com.apple.application com.apple.installer-package-archive public.executable com.apple.disk-image),
    '06 Docs' => %w(com.microsoft.word.doc com.adobe.pdf public.rtf application/vnd.openxmlformats-officedocument.wordprocessingml.template public.log com.apple.iwork.pages.pages com.apple.iwork.keynote.sffkey),
    '05 Archives' => %w(public.archive application/rar-compressed),
    '04 Design' => %w(com.adobe.photoshop-image com.adobe.illustrator.ai-image com.adobe.encapsulated-postscript com.adobe.indesign.indd-document),
    '07 Images' => 'public.image',
    '08 Scripts' => %w(public.source-code public.script public.html text/css dyn.ah62d4rv4ge8024psse),
    '09 Books' => %w(application/epub+zip),
    '10 Data' => %w(text/comma-separated-values com.microsoft.excel.xls public.json)
  }
  DOWNLOAD_TYPES.each do |sub_dir, types|
    rule "Move downloaded #{sub_dir}" do
      puts "--------------------------------------------\n\033[36mMove downloaded #{sub_dir}\033[0m"
      if !File.directory?("/Users/eboney/Downloads/#{sub_dir}")
        puts "~/Downloads/#{sub_dir} is not a directory"
        mkdir("~/Downloads/#{sub_dir}")
      end
      move where_content_type(dir('~/Downloads/*.*'), types), "~/Downloads/#{sub_dir}"
    end
  end

  #   .o88b. db      d88888b  .d8b.  d8b   db db    db d8888b.
  #  d8P  Y8 88      88'     d8' `8b 888o  88 88    88 88  `8D
  #  8P      88      88ooooo 88ooo88 88V8o 88 88    88 88oodD'
  #  8b      88      88~~~~~ 88~~~88 88 V8o88 88    88 88~~~
  #  Y8b  d8 88booo. 88.     88   88 88  V888 88b  d88 88
  #   `Y88P' Y88888P Y88888P YP   YP VP   V8P ~Y8888P' 88

  #
  # Clean Up Homebrew
  #
  # rule 'Clean /Library/Caches/Homebrew/' do
  #   puts "--------------------------------------------\n\033[33mClean /Library/Caches/Homebrew/\033[0m"
  #   dir('/Library/Caches/Homebrew/*.tar.*').each do |path|
  #     trash path if File.mtime(path) < 90.days.ago
  #   end
  #   dir('/Library/Caches/Homebrew/*.tgz').each do |path|
  #     trash path if File.mtime(path) < 90.days.ago
  #   end
  #   dir('/Library/Caches/Homebrew/*.tbz').each do |path|
  #     trash path if File.mtime(path) < 90.days.ago
  #   end
  # end


  # Cleaning up after Maid
  # ----------------------
  # This one should be after all the other 'Downloads' and 'Outbox' rules
  # rule 'Remove empty directories && Kill Stupid .DS_Store files' do
    # puts "--------------------------------------------\n\033[33mRemove empty directories && Kill Stupid .DS_Store files\033[0m"
    # dir(%w(~/Downloads/**/.DS_Store ~/Dropbox/**/.DS_Store ~/Git/**/.DS_Store ~/Code/**/.DS_Store)).each do |path|
      # File.delete(path)
    # end
    # dir(%w(~/Downloads/**/* ~/Dropbox/**/*)).each do |path|
      # if File.directory?(path) && (Dir.entries(path) - %w{ . .. }).empty? && !path.match(/\.app/)
        # trash path
      # end
    # end
  # end

  # Trash
  # rule 'Take out the Trash' do
  #   puts "--------------------------------------------\n\033[31mTake out the Trash\033[0m"
  #   dir('~/.Trash/*').each do |p|
  #     remove(p) if accessed_at(p) > 14.days.ago
  #   end
  #   puts '--------------------------------------------'
  # end


end



rule 'Really old downloads' do
    dir('~/Downloads/*').each do |path|
      trash(path) if 2.days.since?(accessed_at(path))
    end
  end




  #
# Rules for Maid file cleaner, bunch of rules to sorting Photorec output folder.
# Maid Tool : https://github.com/benjaminoakes/maid
# PhotoRec Tool : http://www.cgsecurity.org/wiki/PhotoRec
#
# ----Help----
# Get All extension in directory : find . -type f | perl -ne 'print $1 if m/\.([^.\/]+)$/' | sort -u
# ------------
# Author: HugoPoi
#
# ----Notes----
# The code behind is not best quality code, it's example to demonstrate possibilities
# with 2 ruby gems and a little bunch of codes. If you are a Ruby expert you must correct and clean this code.
# -------------
require "id3tag"

recupDir = '/output/dir/of/photorec'
sortedDir = '/output/dir/for/sorted/files'

Maid.rules do
  rule 'jpg > 10KB' do
    dir(recupDir + '/*/*.jpg').each do |path|
      andir = path.split('/')
      ndir = andir[andir.length - 2]
      if File.size(path) > 10000
        if !File.directory?(sortedDir + '/photos/' + ndir)
          Dir.mkdir(sortedDir + '/photos/' + ndir)
        end
        move(path, sortedDir + '/photos/' + ndir)
      end
    end
  end
  rule 'doc,docx,pdf,xls,xlsx,ppt,pptx,odt,ods' do
    (dir(recupDir + '/*/*.doc') + dir(recupDir + '/*/*.docx') + dir(recupDir + '/*/*.pdf') + dir(recupDir + '/*/*.xls') + dir(recupDir + '/*/*.xlsx') + dir(recupDir + '/*/*.ppt') + dir(recupDir + '/*/*.pptx') + dir(recupDir + '/*/*.odt') + dir(recupDir + '/*/*.ods')).each do |path|
      andir = path.split('/')
      ndir = andir[andir.length - 2]
      if !File.directory?(sortedDir + '/documents/' + ndir)
        Dir.mkdir(sortedDir + '/documents/' + ndir)
      end
      move(path, sortedDir + '/documents/' + ndir)
    end
  end
  rule 'mp3,wma,aac + rename' do
    dir(recupDir + '/*/*.mp3').each do |path|
      tags = ID3Tag.read(File.open(path))
      @artist = tags.artist
      @title = tags.title
      @album = tags.album
      @track_nr = tags.track_nr
      newdir = "/music"
      newname = ""
      if @title == nil or @title.gsub!(/^[ \\\/\s\r\n]+|\/|\\|[ \\\/\s\r\n]+$/, "") == ""
      andir = path.split('/')
        @title = "unknown (" + andir[andir.length - 1].split('.mp3')[0] + ")"
      end
      if @track_nr != nil and @track_nr.gsub!(/^[ \\\/\s\r\n]+|\/|\\|[ \\\/\s\r\n]+$/, "") != ""
        @track_nr = " (" + @track_nr + ")"
      else
        @track_nr = ""
      end
      if @artist != nil and @artist.gsub!(/^[ \\\/\s\r\n]+|\/|\\|[ \\\/\s\r\n]+$/, "") != ""
        newdir << ("/" + @artist)
        newname = @title + @track_nr + " - " + @artist
        if !File.directory?(sortedDir + newdir)
          Dir.mkdir(sortedDir + newdir)
        end
        if @album != nil and @album.gsub!(/^[ \\\/\s\r\n]+|\/|\\|[ \\\/\s\r\n]+$/, "") != ""
          newdir << ("/" + @album)
          if !File.directory?(sortedDir + newdir)
            Dir.mkdir(sortedDir + newdir)
          end
        end
      else
        newname = @title + @track_nr
      end
      rename(path, sortedDir + newdir + "/" + newname + ".mp3")
    end
  end
  rule 'video mp4,avi,mkv,mpg,mov' do
    (dir(recupDir + '/*/*.mp4') + dir(recupDir + '/*/*.avi') + dir(recupDir + '/*/*.mkv') + dir(recupDir + '/*/*.mpg') + dir(recupDir + '/*/*.mov')).each do |path|
      andir = path.split('/')
      ndir = andir[andir.length - 2]
      if !File.directory?(sortedDir + '/video/' + ndir)
        Dir.mkdir(sortedDir + '/video/' + ndir)
      end
      move(path, sortedDir + '/video/' + ndir)
    end
  end
  rule 'audio asf' do
    (dir(recupDir + '/*/*.asf')).each do |path|
      andir = path.split('/')
      ndir = andir[andir.length - 2]
      if !File.directory?(sortedDir + '/music_asf/' + ndir)
        Dir.mkdir(sortedDir + '/music_asf/' + ndir)
      end
      move(path, sortedDir + '/music_asf/' + ndir)
    end
  end
  rule 'archives zip,gz,7z,rar' do
    (dir(recupDir + '/*/*.zip') + dir(recupDir + '/*/*.gz') + dir(recupDir + '/*/*.7z') + dir(recupDir + '/*/*.rar')).each do |path|
      move(path, sortedDir + '/archives/')
    end
  end
end



#!/usr/bin/ruby
# Need `brew install tag` to manage Finder tags

require 'pathname'

Maid.rules do
	rule "test_run" do
		total_run
	end

	watch '~/Downloads' do
		rule 'Downloads Change' do |modified, added, removed|
			new_added(added)
			movie_in_downloads()
			psd_in_downloads()
		end
	end

	watch '~/Desktop' do
		rule 'Desktop Change' do |modified, added, removed|
			new_added(added)
		end
	end

	watch '~/Movies/Video' do
		rule 'Video Change' do |modified, added, removed|
			if added.any?()
				new_added(added)
				video_series()
				video_convert()
			end
		end
	end

	repeat '15m' do
		rule '15m' do
			total_run()
		end
	end

	repeat '1d' do
		rule 'Update System' do
			pid = Process.spawn("brew update;brew upgrade --all")
			Process.detach pid
			pid = Process.spawn("npm update -g")
			Process.detach pid
			pid = Process.spawn("gem update !psych")
			Process.detach pid
		end
	end

	def total_run
		movie_in_downloads()
		psd_in_downloads()
		dmg_in_downloads()
		file_openned()
		trash_old()
		video_series()
		video_convert()
	end

	def new_added(added)
		added =	added.select do |path|
			path = expand(path)
			p = Pathname.new(path)
			p.dirname.to_s == expand('~/Movies/Video') || p.dirname.to_s == expand('~/Desktop') || p.dirname.to_s == expand('~/Downloads')
		end
		if added && added.any? then
			added.each do |path|
				unless has_tags?(path) || File.directory?(path)
					add_tag(path, TagUnfinished) unless has_been_used?(path)
				end
			end
		end
	end

	def movie_in_downloads
		where_content_type(dir_not_downloading('~/Downloads/*'), ['video', 'public.movie']).each do |path|
			move(path, '~/Movies/Video/') if duration_s(path) > 15 * 60
		end
	end

	def psd_in_downloads
		dir_not_downloading('~/Downloads/*.psd').each do |path|
			remove_tag(path, TagUnfinished)
			move(path, '~/Documents/pic_source/')
		end
	end

	def dmg_in_downloads
		dir_not_downloading('~/Downloads/*.{exe,deb,dmg,pkg,zip,app,safariextz}').each do |path|
			if contains_tag?(path, TagSystem) && !contains_tag?(path, TagUnfinished)
				remove_tag(path, TagSystem)
				move(path, '~/Documents/apps2install/')
			end
		end
	end

	def file_openned
		dir_not_downloading('~/{Downloads}/*').each do |path|
			if has_been_used?(path) && contains_tag?(path, TagUnfinished)
				remove_tag(path, TagUnfinished)
			end
		end
	end

	def trash_old
		dir_not_downloading('~/{Downloads,Desktop}/*').each do |path|
			if File.directory?(path) && !is_empty_folder?(path)
				log "trash ignore none empty folder #{path}"
			else
				trash(path) if !has_tags?(path) && has_been_used?(path) && 1.day.since?(used_at(path)) && 2.day.since?(added_at(path))
			end
		end

		where_content_type(dir_not_downloading('~/Movies/Video/*'), ['video', 'public.movie']).each do |path|
			trash(path) if !has_tags?(path) && has_been_used?(path) && 1.day.since?(used_at(path))
		end
		where_content_type(dir_not_downloading('~/Movies/Video/**/*'), ['video', 'public.movie']).each do |path|
			trash(path) if !has_tags?(path) && has_been_used?(path) && 1.day.since?(used_at(path))
		end

		dir_not_downloading('~/Movies/Video/*').each do |path|
			if is_empty_folder?(path)
				remove(path) if has_been_used?(path) && 1.day.since?(used_at(path))
			end
		end

		dir('~/.Trash/*').each do |path|
			remove(path) if 1.week.since?(added_at(path))
		end
	end

	VideoSeriesNameMinPrefixLength = 3
	VideoSeriesNameMaxPrefixLength = 20

	def video_series
		where_content_type(dir_not_downloading('~/Movies/Video/*'), ['video', 'public.movie']).each do |path|
			path = expand(path)
			p = Pathname.new(path)
			name = p.basename.to_s
			prefix = name[0, VideoSeriesNameMinPrefixLength]
			sameSeriesInFolder = where_content_type(dir_not_downloading("~/Movies/Video/*/#{prefix}*"), ['video', 'public.movie']).reject do |e|
				ep = Pathname.new(e)
				expand(e) == path || ep.basename.to_s[0..(0 - ep.extname().length)] == name[0..(0 - p.extname().length)]
			end
			if sameSeriesInFolder.any? then
				move(path, Pathname.new(expand(sameSeriesInFolder[0])).dirname.to_s)
			else
				sameSeries = where_content_type(dir_not_downloading("~/Movies/Video/#{prefix}*"), ['video', 'public.movie']).reject do |e|
					ep = Pathname.new(e)
					expand(e) == path || ep.basename.to_s[0..(0 - ep.extname().length)] == name[0..(0 - p.extname().length)]
				end
				if sameSeries.any? then
					first = Pathname.new(expand(sameSeries[0])).basename.to_s
					prefixLength = VideoSeriesNameMinPrefixLength
					VideoSeriesNameMinPrefixLength.upto([name.length, first.length, VideoSeriesNameMaxPrefixLength].min) do |i|
						if not name[0, i] == first[0, i] then
							break
						end
						prefixLength = i
					end
					folderName = name[0, prefixLength]
					dest = "~/Movies/Video/#{folderName}"
					mkdir(dest)
					move(path, dest)
				end
			end
		end

	end

	def video_convert
		if is_on_battery?()
			return
		end
		where_content_type(dir_not_downloading('~/Movies/{Video/,Video/**/,Video/**/**/}*\.{rmvb,flv}'), ['video', 'public.movie']).each do |path|
			if not contains_tag?(path, TagUnfinished) then
				return
			end
			path = expand(path)
			p = Pathname.new(path)
			ext = p.extname()
			out = path[0, path.length - ext.length] + ".mkv"
			if File.exist?(out) then
				return
			end
			if path =~ /\.rmvb$/
				log "convert #{path}"
				cmd("ffmpeg -i #{sh_escape(path)} -c:v libx264 -preset veryfast -crf 18 -c:a libmp3lame -map_metadata -1 #{sh_escape(out)} && rm #{sh_escape(path)}")
				add_tag(out, TagUnfinished)
			end
			if path =~ /\.flv$/
				log "convert #{path}"
				cmd("ffmpeg -i #{sh_escape(path)} -c copy #{sh_escape(out)} && rm #{sh_escape(path)}")
				add_tag(out, TagUnfinished)
			end
		end
	end

	TagUnfinished = "未完"
	TagWork = "工作"
	TagPersonal = "个人"
	TagProject = "项目"
	TagFavorite = "最爱"
	TagSystem = "系统"

	def is_empty_folder?(path)
		File.directory?(path) && dir("#{path}/*").select { |p| !hidden?(p) }.count == 0
	end

	def is_on_battery?
		if cmd("pmset -g ps | grep AC").length > 0
			return false
		else
			return true
		end
	end

	def dir_downloading(path)
		dir(path).select { |p| !hidden?(p) && downloading?(p) }
	end

	def dir_not_downloading(path)
		dir_safe(path).reject { |path| hidden?(path) }
	end

end


Maid.rules do
  # **NOTE:** It's recommended you just use this as a template; if you run these rules on your machine without knowing
  # what they do, you might run into unwanted results!

dmg_dir = '~/Downloads/AppPkgs'
win_iso_dir = '~/Downloads/isos/Windows'

  rule 'Deleting or Moving dmg\'s to: '+ dmg_dir do
    mkdir(dmg_dir)
    dir(['~/Downloads/*.dmg',]).each do |file|
      trash(file) if 8.week.since?(accessed_at(file))
    end

    dir(['~/Downloads/*.dmg',]).each do |file|
      move(file, dmg_dir) if 1.week.since?(modified_at(file))
    end
  end

  rule 'Move Windows iso archives to iso/Windows dir after 1 week' do
    mkdir(win_iso_dir)
    for file in dir('~/Downloads/*windows*.iso')
      move(file, win_iso_dir) if 1.week.since?(modified_at(file))
    end
  end

  rule 'Move rar archives to rars dir after 2 weeks' do
    rars_dir = '~/Downloads/rars'
    mkdir(rars_dir)
    for file in dir('~/Downloads/*.rar')
      move(file, rars_dir) if 2.week.since?(accessed_at(file))
    end
  end

  rule 'Move .epub files to unsorted after 3 days' do
    ## We should not clutter the Downloads directory with books, instead we should move them
    ## and sort them later. Some .pdfs may not be books, but majority will be.
    unsorted_books_dir='~/Books/Unsorted'
    mkdir(unsorted_books_dir)
    for file in dir('~/Downloads/*.epub')
      move(file, unsorted_books_dir) if 3.days.since?(accessed_at(file))
    end
  end

  rule 'Move .pdf files to unsorted after 3 days' do
    ## We should not clutter the Downloads directory with books, instead we should move them
    ## and sort them later. Some .pdfs may not be books, but majority will be.
    unsorted_books_dir='~/Books/Unsorted'
    mkdir(unsorted_books_dir)
    for file in dir('~/Downloads/*.{pdf}')
      if  disk_usage(file) > 8192
        puts disk_usage(file)
        move(file, unsorted_books_dir) if 3.days.since?(accessed_at(file))
      end
    end
  end

  rule "Trash files that shouldn't have been downloaded" do
    # It's rare that I download these file types and don't put them somewhere else quickly.
    # More often, these are still in Downloads because it was an accident.
    dir('~/Downloads/*.{csv,doc,docx,ics,ppt,pptx,js,rb,xml,xlsx}').each do |file|
      trash(file) if accessed_at(file) > 3.days.ago
    end

    # Quick 'n' dirty duplicate download detection
    trash(dir('~/Downloads/* (1).*'))
    trash(dir('~/Downloads/* (2).*'))
    trash(dir('~/Downloads/*.1'))
  end


rule 'Remove expendable files' do
    dir('~/Downloads/*.{csv,doc,docx,gem,vcs,ics,ppt,js,rb,xml,xlsx}').each do |p|
      trash(p) if 3.days.since?(accessed_at(p))
    end
  end


rule 'Trash zips and tarballs downloaded from GitHub' do
		dir('~/Downloads/*.{zip,tgz,gz,rar,tar}').each do |path|
			if downloaded_from(path).any? { |u| u.match %r{//([^\/]+\.)?github\.com\/} }
				trash path
			end
		end
  end


  rule 'Database Backups' do
		dir('~/Downloads/*.sql').each do |path|
			mkdir( '~/Documents/DB Backups/' + Time.now.strftime("%Y-%m-%d") )
			move(path, '~/Documents/DB Backups/' + Time.now.strftime("%Y-%m-%d") )
		end
  end


  rule 'Trash downloads over a month old' do
		dir('~/Downloads/*').each do |path|
			if 4.weeks.since?(accessed_at(path))
				trash(path)
			end
		end
	end

	rule 'Remove empty directories' do
		dir(['~/Downloads/*']).each do |path|
			if File.directory?(path) && dir("#{ path }/*").empty?
				trash(path)
			end
		end
  end

  Maid.rules do
  rule "Organize WTR PDFs in folders by week and month" do
    dir("~/BTSync/Shared/WTRs/*.pdf").each do |f|
      in_year = /(\d+).(\d+)/.match(f)
      next if in_year.nil?

      destination = "~/BTSync/shared/WTRs/#{created_at(f).year}/#{in_year[1]}/#{in_year[2]}/"
      mkdir(destination) if not File.directory? destination

      move(f, destination)
    end
  end

  # bank statements


   # bank statements
  archive_and_retain("~/Downloads", "financial", %w(qif), 2.days, nil)
  rule "Rename bank statements" do
    root = "~/Downloads"
    dir(File.join root, "*.qif").each do |f|
      source = URI(downloaded_from(f)[0])
      created = created_at(f)

      rename(f, File.join(root, "#{source.host}-#{created.year}-#{created.month}-#{created.day}.qif"))
    end
  end

  # fonts
  rule "Keep Fonts" do
    font_archive = "~/Downloads/archive/fonts"
    mkdir(font_archive) if not File.directory?(font_archive)

    font_exts = %w(.woff .ttf .otf .ps .webfont .eot)
    dir("~/Downloads/*.zip").each do |zipfile|
      has_fonts = zipfile_contents(zipfile).any? { |path| font_exts.member?(File.extname(path)) }

      move(zipfile, font_archive) if has_fonts
    end
  end

  # misc downloads
  archive_and_retain("~/Downloads", "documents", %w(pdf doc docx xsl xslx csv), 1.week, 52.weeks)
  archive_and_retain("~/Downloads", "software", %w(dmg app pkg wdgt jar jnlp exe), 1.day, nil)
  archive_and_retain("~/Downloads", "video", %w(m4v mov), 2.days, 26.weeks)
  archive_and_retain("~/Downloads", "pictures", %w(png jpg jpeg gif), 1.week, 52.weeks)
