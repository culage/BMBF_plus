// BMBF_plus
// 
// BMBFに、プレイリストに存在しない曲を上に持ってくる機能や、
// それらをプレイリストに入れる機能を追加するchrome拡張。

(()=>{
	var loadFunc = () => {
		if (document.querySelector(".outer-container") != null) {
			main();
		} else {
			setTimeout(loadFunc, 100);
		};
	};
	setTimeout(loadFunc, 100);
})();

function main() {

	var UNLISTED_COLOR = "lightyellow";

	// ApiUtil
	// ==============================
	var ApiUtil = {
		CONFIG_API_URL: "/host/beatsaber/config",
		// Config取得
		async GetConfig() {
			var response = await fetch(this.CONFIG_API_URL, {
				method: 'GET',
				cache: 'no-cache',
			});
			return await response.json();
		},
		// Config反映
		async PutConfig(putJson) {
			return await fetch(this.CONFIG_API_URL, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(putJson.Config)
			});
		}
	};


	// UI追加
	// ==============================
	// 曲リスト位置調整
	document.querySelector(".outer-container").style.marginTop = "0px";

	// ボタン追加
	document.querySelector("div.title-message").innerHTML = `
	  <button id="btnDigupSong">Dig up Song</button>　
	  <button id="btnUnlistedToPlaylist">Non-Playlisted to Playlist</button>　
	  <button id="btnSelectToPlaylist">Select to Playlist</button>　
	  <button id="btnRefresh" onclick="location.reload();">Refresh</button>
	`;


	// 曲を上に移動
	// ==============================
	var btnDigupSong = document.querySelector("#btnDigupSong");
	btnDigupSong.addEventListener("click", async function() {
		
		btnDigupSong.disabled = true;
		
		// Config取得
		var j = await ApiUtil.GetConfig();
		
		// 条件ダイアログ表示
		var digupCondition = await ShowDlgDigupCondition();
		if (digupCondition == null) {
			btnDigupSong.disabled = false;
			return;
		}
		
		// プレイリスト未登録曲を上に移動
		var knownSongsList = Object.entries(j.Config.KnownSongs);
		
		var digupSongsList = knownSongsList.filter(entry=>true); // copy
		if (digupCondition.keyword != "") {
			var k = digupCondition.keyword.toLowerCase();
			digupSongsList = digupSongsList.filter(entry=>{
				if (entry[1].Hash.toLowerCase().includes(k) == true) { return true; }
				if (entry[1].SongName.toLowerCase().includes(k) == true) { return true; }
				if (entry[1].SongSubName.toLowerCase().includes(k) == true) { return true; }
				if (entry[1].SongAuthorName.toLowerCase().includes(k) == true) { return true; }
				if (entry[1].LevelAuthorName.toLowerCase().includes(k) == true) { return true; }
				return false;
			});
		}
		if (digupCondition.isUnlistedOnly == true) {
			var playlistHashSet = new Set( j.Config.Playlists.flatMap(playlist=>playlist.SongList.map(song=>song.Hash)) );
			digupSongsList = digupSongsList.filter(entry=>!playlistHashSet.has(entry[1].Hash));
		}
		
		var digupSongsHashSet = new Set( digupSongsList.map(entry=>entry[1].Hash) );
		var notDigupSongsList  = knownSongsList.filter(entry=>!digupSongsHashSet.has(entry[1].Hash));
		var newKnownSongs = notDigupSongsList;
		newKnownSongs.unshift(...digupSongsList);

		j.Config.KnownSongs = Object.fromEntries(newKnownSongs);

		// Config反映
		await ApiUtil.PutConfig(j);
		
		alert("Dig up " + digupSongsList.length + " songs.");
		
		btnDigupSong.disabled = false;
	});

	// 曲を上に移動ダイアログ表示
	function ShowDlgDigupCondition() {
		html=`\
	<div id="dlgDigupCondition" style="position: fixed; inset: 0; margin: auto; width:400px; height:min-content; background-color:white; padding:1em; line-height:2em;">
		Keyword: <input id="txtKeyword" type="text" style="width:300px;"><br>
		<label style="background-color:${UNLISTED_COLOR}; padding: 5px; border:solid 1px lightgray;"><input id="chkUnlistedOnly" type="checkbox" checked>Non-Playlisted Only</label><br>
		<button id="btnDigupOk">Ok</button>　
		<button id="btnDigupCancel">Cancel</button>
	</div>`;
		document.body.insertAdjacentHTML("beforeend", html);
		
		var p = new Promise(resolve=>{
			document.querySelector("#btnDigupOk").addEventListener("click", function() {
				resolve({
					keyword: document.querySelector("#txtKeyword").value,
					isUnlistedOnly: document.querySelector("#chkUnlistedOnly").checked
				});
				document.querySelector("#dlgDigupCondition").remove();
			});
			document.querySelector("#btnDigupCancel").addEventListener("click", function() {
				resolve(null);
				document.querySelector("#dlgDigupCondition").remove();
			});
		});
		
		return p;
	};


	// 未プレイリスト曲をプレイリストに追加
	// ==============================
	var btnUnlistedToPlaylist = document.querySelector("#btnUnlistedToPlaylist");
	btnUnlistedToPlaylist.addEventListener("click", async function() {
		btnUnlistedToPlaylist.disabled = true;

		// Config取得
		var j = await ApiUtil.GetConfig();
		
		// 条件ダイアログ表示
		var playlist = await ShowDlgSelectPlaylist(j);
		if (playlist == null) {
			btnUnlistedToPlaylist.disabled = false;
			return;
		}
		
		// プレイリスト未登録曲を、指定プレイリストに追加
		var knownSongsList = Object.entries(j.Config.KnownSongs);
		
		var playlistHashSet = new Set( j.Config.Playlists.flatMap(playlist=>playlist.SongList.map(song=>song.Hash)) );
		var unlitedSongsList = knownSongsList.filter(entry=>!playlistHashSet.has(entry[1].Hash));
		
		var addedSongsList = unlitedSongsList.filter(entry => playlist.SongList.filter(song => song.Hash == entry[1].Hash).length == 0);
		addedSongsList.forEach(entry=>{
			playlist.SongList.push(entry[1]);
		});

		// Config反映
		await ApiUtil.PutConfig(j);
		ListSelectObserver.Refresh();
		
		alert("Added " + addedSongsList.length + " songs.");
		
		btnUnlistedToPlaylist.disabled = false;
	});

	function ShowDlgSelectPlaylist(j) {
		html=`\
	<div id="dlgSelectPlaylist" style="position: fixed; inset: 0; margin: auto; width:400px; height:min-content; background-color:white; padding:1em; line-height:2em;">
		Playlist: <select id="ddlPlaylist">{PLAYLIST_OPTION}</select><br>
		<button id="btnSelectOk">Ok</button>　
		<button id="btnSelectCancel">Cancel</button>
	</div>`;

		var playlistOption = j.Config.Playlists.map(playlist => `<option>${playlist.PlaylistName}</option>`).join();
		html = html.replace("{PLAYLIST_OPTION}", playlistOption);

		document.body.insertAdjacentHTML("beforeend", html);
		
		var p = new Promise(resolve=>{
			document.querySelector("#btnSelectOk").addEventListener("click", function() {
				var index = document.querySelector("#ddlPlaylist").selectedIndex;
				resolve(j.Config.Playlists[index]);
				document.querySelector("#dlgSelectPlaylist").remove();
			});
			document.querySelector("#btnSelectCancel").addEventListener("click", function() {
				resolve(null);
				document.querySelector("#dlgSelectPlaylist").remove();
			});
		});
		
		return p;
	}


	// 選択された曲をプレイリストに追加
	// ==============================
	var btnSelectToPlaylist = document.querySelector("#btnSelectToPlaylist");
	btnSelectToPlaylist.addEventListener("click", async function() {
		btnSelectToPlaylist.disabled = true;

		// Config取得
		var j = await ApiUtil.GetConfig();
		
		// 条件ダイアログ表示
		var playlist = await ShowDlgSelectPlaylist(j);
		if (playlist == null) {
			btnSelectToPlaylist.disabled = false;
			return;
		}
		
		// 選択曲を、指定プレイリストに追加
		var knownSongsList = Object.entries(j.Config.KnownSongs);
		var selectedSongsList = knownSongsList.filter(entry=>ListSelectObserver.selectedHash.has(entry[1].Hash));
		
		var addedSongsList = selectedSongsList.filter(entry => playlist.SongList.filter(song => song.Hash == entry[1].Hash).length == 0);
		addedSongsList.forEach(entry=>{
			playlist.SongList.push(entry[1]);
		});

		// Config反映
		await ApiUtil.PutConfig(j);
		ListSelectObserver.Refresh();
		
		alert("Added " + addedSongsList.length + " songs.");
		
		btnSelectToPlaylist.disabled = false;
	});

	// 選択された曲のハッシュ値を監視
	var ListSelectObserver = {
		selectedHash: new Set(),
		allHash: [],
		playlistHashSet: new Set(),
		async Refresh() {
			var j = await ApiUtil.GetConfig();
			this.selectedHash.clear();
			this.allHash = Object.entries(j.Config.KnownSongs).map(i => i[1].Hash);
			this.playlistHashSet = new Set( j.Config.Playlists.flatMap(playlist=>playlist.SongList.map(song=>song.Hash)) );
		},
		Init() {
			this.Refresh();
			setInterval(()=>{
				// 未プレイリスト曲の色を変更
				document.querySelectorAll("li[data-song_hash]").forEach(el => {
					var hash = el.dataset.song_hash;
					el.style.backgroundColor = (this.playlistHashSet.has(hash) ? "" : UNLISTED_COLOR);
				});
				// 選択曲の更新
				if (document.querySelector("input.mat-checkbox-input") == null) { return; }
				document.querySelectorAll("li[data-song_hash]").forEach(el => {
					var hash = el.dataset.song_hash;
					if (el.querySelector("input.mat-checkbox-input").checked) {
						this.selectedHash.add(hash);
					} else {
						this.selectedHash.delete(hash);
					}
				});
			}, 300);

			document.querySelector("i.material-icons[mattooltip*='Select all']").addEventListener("click", ()=>{
				if (document.querySelector("input.mat-checkbox-input").checked) {
					this.allHash.forEach(i => this.selectedHash.add(i));
				} else {
					this.selectedHash.clear();
				}
			});
		},
	};

	ListSelectObserver.Init();

}
