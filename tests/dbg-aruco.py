import http.server, threading, functools
from playwright.sync_api import sync_playwright
root='/home/claude/jaguk'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8766),functools.partial(http.server.SimpleHTTPRequestHandler, directory=root))
threading.Thread(target=srv.serve_forever,daemon=True).start()
js='''async (name) => {
  const cv = window.cv instanceof Promise ? await window.cv : window.cv
  const img = new Image(); img.src = name; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img,0,0)
  const src = cv.imread(c); const g = new cv.Mat(); cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY)
  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_50)
  const res = []
  for (const variant of ['default','refine']) {
    const params = new cv.aruco_DetectorParameters()
    const det = new cv.aruco_ArucoDetector(dict, params, new cv.aruco_RefineParameters(10,3,true))
    const corners = new cv.MatVector(), ids = new cv.Mat(), rej = new cv.MatVector()
    det.detectMarkers(g, corners, ids, rej)
    res.push({variant, n: ids.rows, type: ids.type(), cols: ids.cols, ids: Array.from(ids.data32S||[]), rej: rej.size(), w: g.cols})
  }
  return res
}'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
    pg=b.new_page(); pg.goto('http://127.0.0.1:8766/tests/synth.html'); pg.wait_for_function('window.cv')
    pg.wait_for_timeout(1500)
    for n in ['tpl-1.png','photo-q-pen.jpg']: print(n, pg.evaluate(js, n))
    b.close()
srv.shutdown()
