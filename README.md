# VVNB Airfield Planner

Ứng dụng web trực quan hóa khu bay Nội Bài, quản lý vị trí ILS và phác thảo dữ liệu quy hoạch trên bản đồ.

## Yêu cầu

- Node.js 20.19+ hoặc 22.12+
- Kết nối Internet để tải ảnh vệ tinh Esri

## Chạy dự án

```bash
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal. Tạo bản dựng production bằng `npm run build`; xem thử bằng `npm run preview`.

## Cấu hình lưu dữ liệu

Tạo tệp `.env` từ `.env.example`:

```powershell
Copy-Item .env.example .env
```

Giữ `VITE_STORAGE_MODE=local` để dữ liệu tự lưu trên trình duyệt hiện tại. Tệp cấu hình cũng dành sẵn `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` cho chức năng đồng bộ cloud giữa nhiều máy.

## Xuất bản bằng GitHub Pages

Workflow [deploy-pages.yml](.github/workflows/deploy-pages.yml) sẽ tự xây dựng và xuất bản website khi bạn đẩy mã nguồn lên nhánh `main`. Sau khi repository đã có trên GitHub, vào **Settings → Pages**, chọn **GitHub Actions** làm nguồn deploy. Mỗi lần cập nhật nhánh `main`, link GitHub Pages sẽ tự chuyển sang phiên bản mới.

## Đồng bộ configure.json qua GitHub

GitHub OAuth cần một dịch vụ backend để giữ bí mật OAuth client secret và ghi file `configure.json` an toàn. Thiết lập này cần các giá trị ngoài dự án: GitHub OAuth App Client ID, Client Secret, repository đích và URL của dịch vụ đồng bộ. Không đưa Client Secret hoặc personal token vào mã nguồn, `.env` public, hoặc GitHub Pages.

## Tính năng

- Bản đồ ảnh vệ tinh, điều khiển zoom, hướng và góc nghiêng 3D.
- Tạo, sửa, xóa và định vị các thiết bị LLZ, GP, DME; dữ liệu lưu trong trình duyệt.
- Vẽ polygon khu vực, tuyến taxiway và điểm; hoàn tác điểm/nét, xóa và xuất GeoJSON.
- Dữ liệu ILS và bản vẽ được lưu bằng `localStorage` trên thiết bị hiện tại.

## Lưu ý dữ liệu

Đây là công cụ phác thảo và trực quan hóa, không phải nguồn dữ liệu hàng không chính thức hoặc phần mềm dùng cho khai thác bay. Tọa độ ILS mẫu được lấy từ bản HTML tham khảo và cần được kiểm tra trước khi sử dụng. Bản đồ nền sử dụng Esri World Imagery; điều kiện truy cập và attribution theo nhà cung cấp.
