import sys, shutil, time
from gradio_client import Client, handle_file
out, srcs = sys.argv[1], sys.argv[2:]
t = time.time()
c = Client("trellis-community/TRELLIS", verbose=False, httpx_kwargs={"timeout": 600})
c.predict(api_name="/start_session")
pre = c.predict(images=[{"image": handle_file(s), "caption": None} for s in srcs], api_name="/preprocess_images")
print("pre", round(time.time()-t), flush=True)
gal = [{"image": handle_file(p["image"]), "caption": None} for p in pre]
r = c.predict(image=handle_file(pre[0]["image"]), multiimages=gal, seed=0, ss_guidance_strength=7.5, ss_sampling_steps=12,
              slat_guidance_strength=3.0, slat_sampling_steps=12, multiimage_algo="stochastic",
              mesh_simplify=0.95, texture_size=1024, api_name="/generate_and_extract_glb")
shutil.copy(r[0]["video"], out + "/preview.mp4"); shutil.copy(r[2], out + "/golf.glb")
print("gen", round(time.time()-t), flush=True)
g = c.predict(api_name="/extract_gaussian")
shutil.copy(g[1], out + "/golf-splat.ply")
print("done seconds", round(time.time()-t))
