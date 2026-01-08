{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.sqlite
    pkgs.chromium
    pkgs.libuuid
  ];
}
