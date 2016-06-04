var vow = require('vow'),
    _ = require('lodash'),
    path = require('path'),
    utils = require('../utils'),
    orm = require('orm'),
    BM25 = require('fts-js'),
    Authors = require('./Authors'),
    ObjectID = require('mongodb').ObjectID;

/**
 * Контроллер, для работы со стихами
 *
 * @returns {Poems}
 * @constructor
 */
var Poems = function() {
    return this;
};

/**
 * Добавить стихотворение
 *
 * @param pModel
 * @param name
 * @param authorId
 * @param userId
 * @param {String} poem
 *
 * @returns {*}
 */
Poems.create = function(pModel, name, authorId, userId, poem) {
    var deferred = vow.defer();

    pModel.create({
        name: name,
        author_id: authorId,
        class: 0,
        userId: userId,
        moderate: '0',
        poem: this._getLinesFromPoem(poem)
    }, function (err, poem) {
        if (err) throw err;
        deferred.resolve(poem);
    });

    return deferred.promise();
};

/**
 * Подготавливает текст стихотворения для добавления в БД в виде строк с полнотекстовым поиском
 *
 * @param poemText
 * @returns {*}
 * @private
 */
Poems._getLinesFromPoem = function(poemText) {
    var finalText,
        lineNum = 0;

    poemText = utils.formatEmptyLines(poemText);

    finalText = typeof poemText === 'string' ? poemText.split('\n') : poemText;

    return _.chain(finalText)
        .map(function(line, k) {
            return _.isEmpty(line) ? '' : {
                line_num: lineNum++,
                line: line,
                'fts-tokens': JSON.stringify(BM25.Tokenize(line)),
                nextEmpLine: !_.isUndefined(finalText[k + 1]) && _.isEmpty(finalText[k + 1])
            };
        })
        .filter(function(item) {
            return !_.isEmpty(item);
        })
        .value();
};

/**
 * Получить стихотворение из БД по id
 *
 * @param pModel
 * @param poemId
 * @returns {*}
 */
Poems.getPoemById = function(pModel, poemId) {
    var deferred = vow.defer();

    pModel.find({ _id: poemId }).limit(1).run(function (err, poem) {
        if (err) throw err;

        if (_.isEmpty(poem)) {
            deferred.reject([]);
        } else {
            deferred.resolve(poem[0]);
        }
    });

    return deferred.promise();
};

/**
 * Найти стих по автору и названию
 *
 * @param pModel
 * @param authorModel
 * @param query
 * @param {String} author
 * @param userId
 *
 * @returns {*}
 */
Poems.findPoemByAuthorANDQuery = function(pModel, authorModel, query, author, userId) {
    var deferred = vow.defer();

    Authors
        .getIdsByQuery(authorModel, author, userId)
        .then(function(authorIds) {

            pModel
                .find({
                    name: { $regex: new RegExp(query, 'i') },
                    author_id: { $in: _.map(authorIds, function(a, k) { return new ObjectID(k); }) },
                    $or: [{ userId: userId }, { moderate: '1' } ]
                })
                .only('_id', 'name', 'author_id')
                .limit(15)
                .run(function (err, poems) {
                    if (err) throw err;

                    _.forEach(poems, function(p, k) {
                        poems[k].author = { name: authorIds[p.author_id] };
                    });

                    deferred.resolve(poems);
                });
        });

    return deferred.promise();
};

/**
 * Получить стих по точному вхождению названию и автора
 *
 * @param pModel
 * @param authorModel
 * @param {String} name
 * @param {String} author
 * @param userId
 * @returns {*}
 */
Poems.getPoemByNameAndAuthor = function(pModel, authorModel, name, author, userId) {
    var deferred = vow.defer();

    Authors
        .getIdsByQuery(authorModel, author, userId)
        .then(function(authorIds) {
            pModel
                .find({
                    name: name,
                    author_id: { $in: _.map(authorIds, function(a, k) { return new ObjectID(k); }) },
                    or: [{userId: userId}, {moderate: '1'}]
                })
                .limit(1)
                .run(function (err, poems) {
                    if (err) throw err;
                    deferred.resolve(poems);
                });
        });

    return deferred.promise();
};

module.exports = Poems;
