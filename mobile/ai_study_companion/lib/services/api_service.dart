import 'dart:convert';
import 'dart:developer';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:universal_html/html.dart' as html;

import '../features/chat/models/api_response.dart';
import '../features/qiz/models/quiz_response.dart';
import '../network/exceptions/api_exceptions.dart';

// const String baseUrl = 'http://localhost:3000/api';
const String baseUrl = 'https://ai-companion-backend-o6zz1o1la-alexs-projects-54041ff0.vercel.app/api';

class ApiService {
  Future<ApiResponse> sendMessage({
    required String query,
    required List<String> files,
  }) async {
    log('Sending request>>> query: $query, files: $files');

    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/chat-with-context'),
      );
      request.fields['query'] = query;

      for (final file in files) {
        if (file.startsWith('blob:')) {
          // Handle web file upload
          final blob = await _urlToBlob(file);
          final bytes = await _blobToBytes(blob);
          final filename = 'file_${DateTime.now().millisecondsSinceEpoch}.png';
          request.files.add(
            http.MultipartFile.fromBytes(
              'files',
              bytes,
              filename: filename,
              contentType: MediaType('image', 'png'),
            ),
          );
        } else {
          // Handle mobile file upload
          request.files.add(await http.MultipartFile.fromPath('files', file));
        }
      }

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      log('Response status code: ${response.statusCode}');
      log('Response body: ${response.body}');

      final decodedResponse = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return ApiResponse.fromJson(decodedResponse);
      } else {
        final errorMessage =
            decodedResponse['message'] ?? 'Unknown error occurred';
        throw ApiException(
          'Server error: $errorMessage',
          statusCode: response.statusCode,
        );
      }
    } on http.ClientException catch (e) {
      throw ApiException('Network error: ${e.message}');
    } on FormatException catch (_) {
      throw ApiException('Failed to parse response');
    } catch (e) {
      throw ApiException('Unexpected error occurred: $e');
    }
  }

  Future<html.Blob> _urlToBlob(String url) async {
    final response = await html.HttpRequest.request(
      url,
      responseType: 'blob',
    );
    return response.response as html.Blob;
  }

  Future<Uint8List> _blobToBytes(html.Blob blob) async {
    final reader = html.FileReader();
    reader.readAsArrayBuffer(blob);
    await reader.onLoadEnd.first;
    return reader.result as Uint8List;
  }

  Future<QuizResponse> generateQuiz({
    required String documentId,
  }) async {
    log('Generating quiz for document: $documentId');

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/quiz/generate'),
        headers: <String, String>{
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonEncode(<String, dynamic>{
          'documentId': documentId,
        }),
      );
      final decodedResponse = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return QuizResponse.fromJson(decodedResponse);
      } else {
        final errorMessage =
            decodedResponse['message'] ?? 'Unknown error occurred';
        throw ApiException(
          'Server error: $errorMessage',
          statusCode: response.statusCode,
        );
      }
    } on http.ClientException catch (e) {
      throw ApiException('Network error: ${e.message}');
    } on FormatException catch (_) {
      throw ApiException('Failed to parse response');
    } catch (e) {
      throw ApiException('Unexpected error occurred: $e');
    }
  }

  Future<Map<String, dynamic>> evaluateQuiz({
    required String quizId,
    required List<String> answers,
  }) async {
    log('Evaluating quiz: $quizId with answers: $answers');

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/quiz/evaluate'),
        headers: <String, String>{
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonEncode(<String, dynamic>{
          'quizId': quizId,
          'answers': answers,
        }),
      );

      final decodedResponse = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return decodedResponse;
      } else {
        final errorMessage =
            decodedResponse['message'] ?? 'Unknown error occurred';
        throw ApiException(
          'Server error: $errorMessage',
          statusCode: response.statusCode,
        );
      }
    } catch (e) {
      throw ApiException('Error evaluating quiz: $e');
    }
  }

  Future<bool> submitCreds({
    required String openAiKey,
    required String pineconeApiKey,
    required String pineconeIndexname,
  }) async {
    log('Sending credentials to server: $openAiKey, $pineconeApiKey, $pineconeIndexname');

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/set-credentials'),
        headers: <String, String>{
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonEncode(
          <String, dynamic>{
            "openaiApiKey": openAiKey,
            "pineconeApiKey": pineconeApiKey,
            "pineconeIndexName": pineconeIndexname,
          },
        ),
      );

      log('Server response: ${response.statusCode}');
      final decodedResponse = jsonDecode(response.body);

      log('Server response: $decodedResponse');
      if (response.statusCode == 200) {
        return true;
      } else {
        final errorMessage = decodedResponse ?? 'Unknown error occurred';
        throw ApiException(
          'Server error: $errorMessage',
          statusCode: response.statusCode,
        );
      }
    } catch (e) {
      throw ApiException('Error setting credentials: $e');
    }
  }
}
