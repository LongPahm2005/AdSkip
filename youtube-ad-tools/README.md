# YouTube Ad Tools

Extension Manifest V3 cho Google Chrome và Microsoft Edge. Dự án dùng React, Vite và JavaScript để hiển thị trạng thái player YouTube, áp dụng một quy tắc chặn request quảng cáo có phạm vi hẹp, và tự nhấn nút Skip chính thức khi nút khả dụng.

Extension không chặn luồng video, media segment hoặc manifest; không thay đổi nội dung/phát video; và không bảo đảm chặn được mọi quảng cáo.

## Cách hoạt động

- Content script bắt đầu tại `document_start`, theo dõi tín hiệu quảng cáo trong player và các thay đổi DOM/điều hướng SPA của YouTube.
- Chỉ coi quảng cáo đã nhận diện khi có ít nhất hai tín hiệu phù hợp. Nếu chưa đủ bằng chứng, trạng thái được để ở mức chưa xác định/chuyển tiếp.
- Static ruleset DNR chỉ chứa một rule cho request `xmlhttprequest` tới `googleads.g.doubleclick.net/pagead/ads`, với initiator là host YouTube. Ruleset được bật khi công tắc **Tự động xử lý** bật và bị tắt khi người dùng tắt công tắc.
- Nếu YouTube cung cấp nút Skip chính thức đang hiển thị và có thể thao tác, extension thử tối đa hai lần trong một lượt quảng cáo. Một lần gửi click không đồng nghĩa với việc quảng cáo đã bị chặn.
- Trạng thái, thống kê và nhật ký gần đây được lưu cục bộ trong `chrome.storage.local`. Extension không gửi dữ liệu phân tích ra máy chủ.

### Giới hạn

YouTube có thể phân phối quảng cáo qua endpoint khác, endpoint first-party hoặc cách phân phối giống nội dung media. Rule hiện tại sẽ không bao phủ các trường hợp đó; không mở rộng rule sang media/video để tránh làm hỏng nội dung chính. Selector player cũng có thể thay đổi theo YouTube.

Extension không đăng ký quyền `declarativeNetRequestFeedback`, nên không thể khẳng định hay ghi nhận `NETWORK_RULE_MATCHED` trong môi trường production. Việc ruleset được bật không chứng minh request đã khớp hoặc quảng cáo đã bị chặn. Không tuyên bố chặn 100%.

## Yêu cầu

- Node.js 22 LTS và npm.
- Python 3 để chạy script xác minh ZIP (`test:archive`).
- Không cần API key, backend hoặc dịch vụ trả phí.

## Phát triển và kiểm tra

Chạy lệnh trong thư mục `youtube-ad-tools`:

```sh
npm ci
npm run dev
npm run lint
npm run check:version
npm run test:unit
npm run build
npm run test:package
npm run test:e2e
```

Các script:

| Lệnh | Mục đích |
|---|---|
| `npm run lint` | Kiểm tra mã nguồn bằng Oxlint |
| `npm run check:version` | So khớp version của `package.json` và manifest; trong workflow tag phải là `v<version>` |
| `npm run test:unit` | Chạy unit test trên Node.js với DOM/API fixture |
| `npm run build` | Build popup, content script, service worker và chép file public vào `dist/` |
| `npm run test:package` | Kiểm tra manifest MV3, tham chiếu asset, file build và phạm vi rule DNR |
| `npm run test:e2e` | Build production rồi chạy package smoke test; không điều khiển trình duyệt thật |
| `npm run test:archive -- <zip-path> dist` | Kiểm tra ZIP khớp chính xác với `dist/`, gồm manifest và các file extension cần thiết |

Unit test DNR giả lập Chrome API; package test kiểm tra rule và tài nguyên đã build. Đây không phải kiểm thử quảng cáo thực tế hoặc bằng chứng player không gặp lỗi trên mọi video.

## Cài extension để thử

1. Trong thư mục dự án, chạy `npm ci` rồi `npm run build`.
2. Mở `chrome://extensions` trên Chrome hoặc `edge://extensions` trên Edge.
3. Bật **Developer mode**.
4. Chọn **Load unpacked** và chọn thư mục `dist/`.
5. Mở hoặc tải lại tab YouTube. Bật công tắc trong popup để bật xử lý tự động.

Tab YouTube đã mở trước khi cài extension cần được tải lại. Popup hiển thị trạng thái player, thống kê và một số sự kiện gần đây. Nhật ký có thể gồm `AD_SIGNAL_DETECTED`, `SKIP_ACTION_PERFORMED`, `SKIP_ACTION_UNCONFIRMED`, `AD_BLOCK_UNCONFIRMED` và `VIDEO_PLAYBACK_ERROR`. Không có sự kiện `NETWORK_RULE_MATCHED` trong production vì giới hạn quyền DNR feedback.

## Kiểm thử thủ công trên trình duyệt

Thử riêng trên Chrome và Edge; quảng cáo có thể không được YouTube phân phối trong lần kiểm tra:

1. Tắt công tắc, phát video và xác nhận extension không thực hiện Skip tự động.
2. Bật công tắc, tải lại tab rồi phát video không quảng cáo; nội dung chính cần phát bình thường.
3. Nếu gặp quảng cáo đầu video hoặc giữa video, quan sát nhật ký và xác nhận extension chỉ tương tác với nút Skip chính thức khi nút khả dụng.
4. Thử điều hướng sang video khác bằng SPA của YouTube và mở cùng URL ở tab thứ hai.
5. Tắt công tắc trong lúc phát, sau đó bật lại; xác nhận hành động Skip dừng khi tắt.
6. Nếu phát sinh lỗi video, ghi lại trình duyệt/phiên bản, trạng thái player và `VIDEO_PLAYBACK_ERROR`. Không coi việc không gặp quảng cáo là test thành công cho chức năng chặn.

Kiểm thử tự động hiện không mô phỏng đầy đủ quảng cáo preroll/midroll do YouTube phân phối, hành vi player thật, khôi phục phát video, nhiều tab thật hoặc tải lại trình duyệt. Cần thử trực tiếp và không suy ra request DNR đã khớp chỉ từ việc rule được bật.

## CI, artifact và phát hành

GitHub Actions được cấu hình tại repository:

- CI chạy khi push lên `develop` hoặc `main`, và khi có pull request vào `main`.
- CI cài dependency bằng `npm ci`, kiểm tra version, lint, unit test, build và package test.
- Khi push lên `main` và mọi bước kiểm tra thành công, CI tạo ZIP từ `dist/`, xác minh ZIP và tải lên artifact ZIP cùng thư mục build. Artifact được giữ 14 ngày.
- Release workflow chạy khi push Git tag dạng `v*`. Workflow kiểm tra version/tag, xác nhận commit nằm trên `main`, chạy lại lint/test/build/package test, xác minh ZIP rồi tạo GitHub Release. Nếu Release đã tồn tại, workflow dừng thay vì ghi đè.
- Chỉ job tạo Release cần quyền `contents: write`; workflow CI chỉ có quyền đọc repository. Không cần GitHub Secret bổ sung.

Tải artifact từ **GitHub → Actions → chọn lần chạy thành công → Artifacts**. Giải nén ZIP và dùng **Load unpacked** với thư mục chứa `manifest.json`, hoặc tải artifact unpacked.

Để phát hành, cập nhật cùng version trong `package.json` và `public/manifest.json`, merge commit vào `main`, rồi tạo tag mới, ví dụ:

```sh
git tag v1.0.1
git push origin v1.0.1
```

Release chỉ được phân phối qua GitHub; không tự động tải lên Chrome Web Store hoặc Microsoft Edge Add-ons. Việc dùng GitHub-hosted runner và thời hạn artifact vẫn phụ thuộc hạn mức của gói GitHub/repository.

**Trạng thái kiểm thử:** các lệnh local không thay thế kết quả chạy GitHub Actions. Chỉ xem CI hoặc Release thành công sau khi workflow tương ứng đã thực sự chạy trên GitHub và có kết quả thành công.