import Foundation
import Vision
import Translation

@_cdecl("hghub_read_subtitle")
public func readSubtitle(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let data = Data(base64Encoded: String(cString: input)) else { return nil }
    let request = VNRecognizeTextRequest()
    request.recognitionLanguages = ["zh-Hans", "zh-Hant"]
    request.recognitionLevel = .accurate
    do {
        try VNImageRequestHandler(data: data).perform([request])
        let candidates = (request.results ?? []).filter {
            $0.boundingBox.midX > 0.20 && $0.boundingBox.midX < 0.80
        }.sorted { $0.boundingBox.midY > $1.boundingBox.midY }
        let text = candidates.compactMap { $0.topCandidates(1).first?.string }
            .filter { $0.range(of: "\\p{Han}", options: .regularExpression) != nil }
            .joined(separator: " ")
        return strdup(text)
    } catch { return nil }
}

@_cdecl("hghub_translate_subtitle")
public func translateSubtitle(
    _ input: UnsafePointer<CChar>,
    _ callback: @escaping @convention(c) (UInt64, UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> Void,
    _ requestID: UInt64
) {
    let text = String(cString: input)
    guard #available(iOS 26.0, *) else {
        "On-device subtitles require iOS 26 or newer.".withCString { callback(requestID, nil, $0) }
        return
    }
    Task {
        do {
            let source = Locale.Language(identifier: "zh-Hans")
            let target = Locale.Language(identifier: "vi")
            let status = await LanguageAvailability().status(from: source, to: target)
            guard status == .installed else {
                "Download Chinese and Vietnamese in Apple Translate first.".withCString { callback(requestID, nil, $0) }
                return
            }
            let session = TranslationSession(installedSource: source, target: target)
            let translated = try await session.translate(text).targetText
            translated.withCString { callback(requestID, $0, nil) }
        } catch {
            error.localizedDescription.withCString { callback(requestID, nil, $0) }
        }
    }
}

@_cdecl("hghub_free_subtitle")
public func freeSubtitle(_ text: UnsafeMutablePointer<CChar>) {
    free(text)
}
