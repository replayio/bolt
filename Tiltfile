def bolt(bolt_directory=config.main_dir, dispatch='wss://dispatch.replay.io', resource_deps=[]):
  local_resource(
    "bolt deps",
    "pnpm install build",
    deps=["package.json"],
    dir=bolt_directory,
    allow_parallel=True
  )
  local_resource(
    "bolt dev server",
    serve_cmd=os.path.join(bolt_directory, "./node_modules/.bin/wrangler") + " pages dev",
    deps=[],
    resource_deps=["bolt deps"] + resource_deps,
    serve_dir=bolt_directory,
    serve_env={
        "REPLAY_DISPATCH_URL": dispatch,
    }
  )
